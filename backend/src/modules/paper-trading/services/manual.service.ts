import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppError, invariant } from '../../../shared/errors.js';
import { announce, redis } from '../../../shared/redis.js';
import { instruments } from '../../market-data/repository.js';
import { engineClient, engineInstruments } from '../../engine/services/engine.service.js';
import { validateSourcedRule } from '../../market-data/services/capabilities.service.js';
import { ensureMonthlyHistory } from '../../market-data/services/dhan-cache.service.js';
import { updatePaperSubscriptions } from '../../market-feed/services/paper-subscriptions.service.js';
import { strategyHistoryPlan } from '../../backtesting/services/history-plan.js';
import { stockQuotes } from '../../stock-details/services/quotes.service.js';
import type { Strategy } from '../../strategies/models/strategy.model.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, PaperTriggerModel, type PaperSession, type PaperTrigger, type TradePlan } from '../models/paper.model.js';
import { manualAccountSchema, manualOrderSchema, manualTriggerSchema } from '../validations/manual.validation.js';
import { evaluationWindow } from './evaluation-window.js';
import { manualPlan } from './manual-plan.js';
export { manualPlan } from './manual-plan.js';
import { markPaperPosition } from './valuation.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { PAPER_HEARTBEAT, sessionTime, stopPaperSession } from './paper.service.js';

export const MANUAL_STRATEGY_ID = 'manual-trading';
const DAY = 86_400_000;
const MARKET_ORDER_MS = 120_000;
const MAX_ACTIVE_TRIGGERS = 50;
const anyCandle = (side: 'BUY' | 'SELL') => ({ name: side === 'BUY' ? 'Manual entry' : 'Manual exit', tier: 'tactical', side, horizon: 'swing', cadence: 'daily', logic: 'AND',
  groups: [{ logic: 'AND', conditions: [{ left: 'close', leftFrame: '1d', operator: 'gt', rightType: 'value', value: 0 }] }] });

const manualStrategy = (capital: number): Strategy => ({ _id: MANUAL_STRATEGY_ID, name: 'Manual trading', revision: 1, savedAt: new Date().toISOString(),
  entry: anyCandle('BUY'), exit: anyCandle('SELL'),
  risk: manualPlan({ stop: { mode: 'percent', value: 2 }, targets: [], breakeven: 'off', trailing: 'off' }, 'delivery', capital) } as unknown as Strategy);

export async function manualSession() { return PaperSessionModel.findOne({ active: true, mode: 'manual' }).lean<PaperSession>(); }
async function requireManual() { const session = await manualSession(); invariant(session, 'Open a manual paper trading account first'); return session; }

export async function openManualAccount(raw: unknown) {
  const { capital } = manualAccountSchema.parse(raw);
  invariant(!await manualSession(), 'A manual paper account is already open');
  const session = await PaperSessionModel.create({ _id: randomUUID(), strategyId: MANUAL_STRATEGY_ID, strategy: manualStrategy(capital), ids: [], mode: 'manual',
    cashPaise: capital * 100, initialPaise: capital * 100, entriesPaused: false, active: true, createdAt: new Date().toISOString(), revision: 1,
    message: 'Manual paper trading. Orders fill on live prices during market hours; your stop-loss and targets are managed automatically.' });
  return session.toObject();
}
/** Closing requires no open positions, exactly as stopping a strategy session. Pending orders and conditions are cancelled. */
export async function closeManualAccount() {
  const session = await requireManual();
  await stopPaperSession(session._id);
  await PaperTriggerModel.updateMany({ sessionId: session._id, status: 'active' }, { $set: { status: 'cancelled', message: 'Manual account closed' } });
}

async function requireWorker() { invariant(await redis.exists(PAPER_HEARTBEAT), 'The paper worker must be running (start the app with npm run dev).'); }
/** ATR comes from completed daily candles, downloaded if missing. */
async function atrFor(instrumentId: string, plan: TradePlan) {
  const stock = await instruments.findById(instrumentId).lean(); invariant(stock, 'Unknown stock');
  const today = sessionTime().date, from = new Date(Date.parse(today) - 120 * DAY).toISOString().slice(0, 10);
  await ensureMonthlyHistory(stock, from, today, { maxWaitMs: 30_000 });
  const strategy = { entry: anyCandle('BUY'), exit: anyCandle('SELL'), risk: plan };
  const cutoff = new Date().toISOString();
  const { data } = await engineClient.post<{ results: { atr: number | null }[] }>('/decisions', { strategy, cutoff, instruments: await engineInstruments([instrumentId], cutoff, false, strategyHistoryPlan(strategy as never, today, today)) });
  const atr = data.results[0]?.atr; invariant(atr && atr > 0, 'Not enough daily history to calculate ATR for this stock. Use a price or % stop-loss.');
  return atr;
}
async function referencePrice(instrumentId: string) {
  const stock = await instruments.findById(instrumentId).lean(); invariant(stock?.active, 'This stock is not in the active stock universe');
  try { return (await stockQuotes([stock], { snapshotMaxAgeMs: 30_000 })).quotes[0]?.price ?? null; } catch { return null; }
}
const dayEnd = (overnight: boolean) => new Date(`${sessionTime().date}T${overnight ? '15:30' : '15:15'}:00+05:30`).toISOString();

export async function placeManualOrder(raw: unknown) {
  const input = manualOrderSchema.parse(raw);
  const existing = await PaperOrderModel.findById(input.id).lean();
  if (existing) { invariant(existing.instrumentId === input.instrumentId && existing.side === input.side, 'Order ID already used for a different order'); return existing; }
  const session = await requireManual(); await requireWorker();
  invariant(sessionTime().open, 'Orders fill during market hours (09:15–15:30 IST). Use a condition to act at a later time.');
  const stock = await instruments.findById(input.instrumentId).lean(); invariant(stock?.active, 'This stock is not in the active stock universe');
  const plan = input.side === 'BUY' ? manualPlan(input.protection!, input.product, session.initialPaise / 100) : undefined;
  if (plan) invariant(plan.overnight || sessionTime().minute < 915, 'Intraday buys close at 3:15 PM IST. Choose delivery or wait for the next session.');
  const price = await referencePrice(input.instrumentId);
  if (input.side === 'BUY' && price) invariant(input.quantity * price * (1 + plan!.feePercent / 100) <= session.cashPaise / 100, `Not enough paper cash: about ₹${Math.ceil(input.quantity * price).toLocaleString('en-IN')} needed, ₹${Math.floor(session.cashPaise / 100).toLocaleString('en-IN')} available`);
  if (plan?.stopMode === 'price' && price) invariant(plan.stopValue! < price, 'The stop-loss must be below the current price');
  const atr = plan?.stopMode === 'ATR' ? await atrFor(input.instrumentId, plan) : undefined;
  const now = Date.now(), at = new Date(now).toISOString();
  const overnight = plan?.overnight ?? true;
  const expiresAt = input.orderType === 'market' ? new Date(now + MARKET_ORDER_MS).toISOString() : dayEnd(overnight);
  let order;
  await mongoose.connection.transaction(async transaction => {
    const held = await PaperPositionModel.findOne({ sessionId: session._id, instrumentId: input.instrumentId }).session(transaction).lean();
    if (input.side === 'BUY') invariant(!held, `You already hold ${stock.symbol}. Sell it before buying again (one position per stock).`);
    else invariant(held && held.quantity >= input.quantity, held ? `You hold ${held.quantity} shares` : `You don't hold ${stock.symbol}`);
    const active = await PaperOrderModel.findOne({ sessionId: session._id, instrumentId: input.instrumentId, status: { $in: ['pending', 'confirmation'] } }).session(transaction).lean();
    invariant(!active, active?.source === 'protection' ? 'An automatic stop-loss/target exit is already in progress for this stock.' : 'This stock already has an open order. Cancel or modify it first.');
    order = (await PaperOrderModel.create([{ _id: input.id, sessionId: session._id, instrumentId: input.instrumentId, side: input.side, quantity: input.quantity, source: 'manual', status: 'pending',
      orderType: input.orderType, ...(input.limitPrice ? { limitPaise: Math.round(input.limitPrice * 100) } : {}), ...(input.triggerPrice ? { triggerPaise: Math.round(input.triggerPrice * 100) } : {}),
      createdAt: at, eligibleAfter: at, expiresAt, atr, plan, positionOpenedAt: held?.openedAt,
      reason: input.side === 'BUY' ? `Manual ${input.product} buy` : 'Manual sell' }], { session: transaction }))[0].toObject();
  });
  await updatePaperSubscriptions(true); await announce('paper.orders');
  return order;
}

const VALIDITY: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
const conditionRule = (trigger: Pick<PaperTrigger, 'rule' | 'cadence' | 'side'>, side: 'BUY' | 'SELL') =>
  ({ name: 'Manual condition', tier: 'tactical', side, horizon: trigger.cadence === 'daily' ? 'swing' : 'intraday', cadence: trigger.cadence, ...trigger.rule });
export const triggerStrategy = (trigger: Pick<PaperTrigger, 'rule' | 'cadence' | 'side' | 'plan'>, fallback: TradePlan) =>
  ({ entry: conditionRule(trigger, 'BUY'), exit: conditionRule(trigger, 'SELL'), risk: trigger.plan ?? fallback });

export async function createManualTrigger(raw: unknown) {
  const input = manualTriggerSchema.parse(raw);
  const session = await requireManual();
  const stock = await instruments.findById(input.instrumentId).lean(); invariant(stock?.active, 'This stock is not in the active stock universe');
  invariant(await PaperTriggerModel.countDocuments({ sessionId: session._id, status: 'active' }) < MAX_ACTIVE_TRIGGERS, `Up to ${MAX_ACTIVE_TRIGGERS} active conditions. Cancel one first.`);
  if (input.side === 'SELL') {
    const held = await PaperPositionModel.findOne({ sessionId: session._id, instrumentId: input.instrumentId }).lean();
    invariant(held, `You don't hold ${stock.symbol}. A sell condition applies to shares you hold.`);
  }
  const plan = input.side === 'BUY' ? manualPlan(input.protection!, input.product, session.initialPaise / 100) : undefined;
  const draft = { rule: input.rule, cadence: input.cadence, side: input.side };
  // The engine validates the same way it validates strategy rules.
  await validateSourcedRule(conditionRule(draft, input.side));
  const now = Date.now(), created = new Date(now).toISOString();
  const validUntil = input.validity === 'day' ? new Date(`${sessionTime(now).date}T${input.product === 'intraday' ? '15:15' : '15:30'}:00+05:30`).toISOString() : new Date(now + VALIDITY[input.validity] * DAY).toISOString();
  invariant(Date.parse(validUntil) > now, 'Today\'s session has ended. Choose a validity of 7 days or more.');
  const trigger = await PaperTriggerModel.create({ _id: randomUUID(), sessionId: session._id, instrumentId: input.instrumentId, symbol: stock.symbol, side: input.side, rule: input.rule, cadence: input.cadence,
    quantity: input.quantity, plan, status: 'active', validUntil, createdAt: created, message: 'Waiting for the next completed candle.' });
  await updatePaperSubscriptions(true); await announce('paper.orders');
  return trigger.toObject();
}
export async function cancelManualTrigger(id: string) {
  const result = await PaperTriggerModel.updateOne({ _id: id, status: 'active' }, { $set: { status: 'cancelled', message: 'Cancelled by you' } });
  invariant(result.modifiedCount, 'Only active conditions can be cancelled');
  await updatePaperSubscriptions(); await announce('paper.orders');
}

/** Checks each active condition once per completed candle created after the condition; a match places one market order. */
export async function evaluateManualTriggers(now = Date.now(), canContinue = () => true) {
  const session = await manualSession(); if (!session) return;
  await PaperTriggerModel.updateMany({ sessionId: session._id, status: 'active', validUntil: { $lte: new Date(now).toISOString() } }, { $set: { status: 'expired', message: 'Validity ended before the condition was met' } });
  const triggers = await PaperTriggerModel.find({ sessionId: session._id, status: 'active' }).lean();
  for (const trigger of triggers) {
    if (!canContinue()) return;
    const window = evaluationWindow(trigger.cadence, trigger.createdAt, now);
    if (!window || trigger.lastBarEnd === window.barEnd) continue;
    const note = (message: string, extra: Record<string, unknown> = {}) => PaperTriggerModel.updateOne({ _id: trigger._id, status: 'active' }, { $set: { checkedAt: new Date(now).toISOString(), message, ...extra } });
    try {
      const strategy = triggerStrategy(trigger, session.strategy.risk), today = sessionTime(now).date;
      const { data } = await engineClient.post<{ results: { barEnd: string | null; entry: { matched: boolean | null }; exit: { matched: boolean | null }; atr: number | null }[] }>('/decisions',
        { strategy, cutoff: window.barEnd, instruments: await engineInstruments([trigger.instrumentId], window.barEnd, false, strategyHistoryPlan(strategy as never, today, today)) });
      const result = data.results[0];
      // The completed candle may still be arriving; retry until its window passes.
      if (!result?.barEnd || Date.parse(result.barEnd) !== Date.parse(window.barEnd)) { await note('Waiting for the completed candle data.'); continue; }
      const matched = trigger.side === 'BUY' ? result.entry.matched : result.exit.matched;
      if (matched === null) { await note('Some rule data is unavailable for this candle; checking again on the next one.', { lastBarEnd: window.barEnd }); continue; }
      if (!matched) { await note(`Not met on the ${new Date(window.barEnd).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} candle.`, { lastBarEnd: window.barEnd }); continue; }
      if (trigger.plan?.stopMode === 'ATR' && !(result.atr && result.atr > 0)) { await note('Condition met, but ATR is unavailable for the stop-loss; checking again on the next candle.', { lastBarEnd: window.barEnd }); continue; }
      await mongoose.connection.transaction(async transaction => {
        const current = await PaperTriggerModel.findOne({ _id: trigger._id, status: 'active' }).session(transaction).lean(); if (!current) return;
        const held = await PaperPositionModel.findOne({ sessionId: session._id, instrumentId: trigger.instrumentId }).session(transaction).lean();
        const busy = await PaperOrderModel.exists({ sessionId: session._id, instrumentId: trigger.instrumentId, status: { $in: ['pending', 'confirmation'] } }).session(transaction);
        const fail = (message: string) => PaperTriggerModel.updateOne({ _id: trigger._id }, { $set: { status: 'failed', message, checkedAt: new Date(now).toISOString() } }, { session: transaction });
        if (busy) { await fail('Condition met, but the stock already had an open order.'); return; }
        if (trigger.side === 'BUY' && held) { await fail('Condition met, but you already hold this stock.'); return; }
        if (trigger.side === 'SELL' && !held) { await fail('Condition met, but the shares were already sold.'); return; }
        if (trigger.side === 'BUY' && !trigger.plan!.overnight && sessionTime(now).minute >= 915) { await fail('Condition met after the 3:15 PM intraday cut-off; no order placed.'); return; }
        const orderId = randomUUID(), at = new Date(now).toISOString();
        await PaperOrderModel.create([{ _id: orderId, sessionId: session._id, instrumentId: trigger.instrumentId, side: trigger.side, quantity: trigger.side === 'SELL' ? Math.min(trigger.quantity, held!.quantity) : trigger.quantity,
          source: 'manual', status: 'pending', orderType: 'market', createdAt: at, eligibleAfter: at, expiresAt: new Date(now + MARKET_ORDER_MS).toISOString(),
          plan: trigger.plan, atr: result.atr ?? undefined, positionOpenedAt: held?.openedAt, triggerId: trigger._id, reason: `Condition met on the completed ${trigger.cadence} candle` }], { session: transaction });
        await PaperTriggerModel.updateOne({ _id: trigger._id }, { $set: { status: 'triggered', triggeredAt: at, orderId, lastBarEnd: window.barEnd, checkedAt: at, message: 'Condition met. Market order placed.' } }, { session: transaction });
      });
      await announce('paper.orders');
    } catch (error) {
      await note(error instanceof AppError ? `Check failed: ${error.message}` : 'Check failed; retrying on the next candle.');
    }
  }
}

/** Account overview, optionally narrowed to one stock for the stock screen. */
export async function manualOverview(instrumentId?: string) {
  const session = await manualSession();
  if (!session) return { account: null };
  const filter = { sessionId: session._id, ...(instrumentId ? { instrumentId } : {}) };
  const [positions, orders, triggers, allPositions, feed] = await Promise.all([
    PaperPositionModel.find(filter).lean(),
    PaperOrderModel.find(filter).sort({ createdAt: -1 }).limit(instrumentId ? 30 : 100).lean(),
    PaperTriggerModel.find(filter).sort({ createdAt: -1 }).limit(instrumentId ? 30 : 100).lean(),
    PaperPositionModel.find({ sessionId: session._id }).lean(), feedStatus(),
  ]);
  const mark = (p: (typeof allPositions)[number]) => ({ ...p, mark: markPaperPosition(p, feed.quotes.find(q => q.instrumentId === p.instrumentId)) });
  const marked = allPositions.map(mark);
  const holdingsPaise = marked.reduce((sum, p) => sum + (p.mark?.valuePaise ?? p.costPaise), 0);
  return { account: { _id: session._id, cashPaise: session.cashPaise, initialPaise: session.initialPaise, holdingsPaise, equityPaise: session.cashPaise + holdingsPaise, createdAt: session.createdAt, openPositions: allPositions.length },
    positions: instrumentId ? positions.map(mark) : marked, orders, triggers, marketOpen: sessionTime().open, workerRunning: !!await redis.exists(PAPER_HEARTBEAT) };
}
