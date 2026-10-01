import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualOrderSchema, manualTriggerSchema, protectionSchema } from '../src/modules/paper-trading/validations/manual.validation.js';
import { manualPlan } from '../src/modules/paper-trading/services/manual-plan.js';
import { positionTargets } from '../src/modules/paper-trading/services/exit-targets.js';
import { initialRiskDistance, advanceStop } from '../src/modules/paper-trading/services/stop-management.js';
import { buySize, orderEstimate } from '../src/modules/paper-trading/services/order-estimate.js';
import type { PaperOrder, PaperPosition, PaperSession } from '../src/modules/paper-trading/models/paper.model.js';

const id = '7b4f1c2e-1111-4a2b-9c3d-000000000001';
const protection = (extra = {}) => protectionSchema.parse({ stop: { mode: 'percent', value: 2 }, targets: [{ basis: 'percent', value: 3, sellPercent: 50 }, { basis: 'percent', value: 6, sellPercent: 50 }], ...extra });

test('every manual buy needs a stop-loss; sells and conditions are validated before reaching the engine', () => {
  assert.equal(manualOrderSchema.safeParse({ id, instrumentId: 'NSE:2885', side: 'BUY', quantity: 5 }).success, false, 'no stop-loss');
  assert.ok(manualOrderSchema.safeParse({ id, instrumentId: 'NSE:2885', side: 'BUY', quantity: 5, protection: protection() }).success);
  assert.ok(manualOrderSchema.safeParse({ id, instrumentId: 'NSE:2885', side: 'SELL', quantity: 5 }).success, 'sells need no protection');
  assert.equal(manualOrderSchema.safeParse({ id, instrumentId: 'NSE:2885', side: 'BUY', quantity: 5, orderType: 'limit', protection: protection() }).success, false, 'limit needs a price');
  assert.equal(manualOrderSchema.safeParse({ id, instrumentId: 'NSE:2885', side: 'BUY', quantity: 5, orderType: 'stop', protection: protection() }).success, false, 'stop needs a trigger');
  assert.equal(protectionSchema.safeParse({ stop: { mode: 'percent', value: 40 } }).success, false, 'stop-loss over 25%');
  assert.equal(protectionSchema.safeParse({ stop: { mode: 'percent', value: 2 }, targets: [{ basis: 'percent', value: 3, sellPercent: 60 }, { basis: 'percent', value: 5, sellPercent: 30 }] }).success, false, 'sell % must total 100');
  assert.equal(protectionSchema.safeParse({ stop: { mode: 'percent', value: 2 }, targets: [{ basis: 'percent', value: 5, sellPercent: 50 }, { basis: 'percent', value: 3, sellPercent: 50 }] }).success, false, 'targets increase');
  assert.equal(protectionSchema.safeParse({ stop: { mode: 'percent', value: 2 }, targets: [{ basis: 'percent', value: 3, sellPercent: 100 }], breakeven: 'target1' }).success, false, 'breakeven after T1 needs a partial T1');
  assert.equal(protectionSchema.safeParse({ stop: { mode: 'trailing', value: 2 }, trailing: 'after1R' }).success, false, 'no double trailing');
  const rule = { logic: 'AND', groups: [{ logic: 'AND', conditions: [{ left: 'rsi', leftFrame: '15m', operator: 'crossAbove', value: 30 }] }] };
  assert.ok(manualTriggerSchema.safeParse({ instrumentId: 'NSE:2885', side: 'BUY', quantity: 1, cadence: '15m', rule, protection: protection() }).success);
  assert.equal(manualTriggerSchema.safeParse({ instrumentId: 'NSE:2885', side: 'BUY', quantity: 1, cadence: 'daily', product: 'intraday', rule, protection: protection() }).success, false, 'intraday needs intraday candles');
});

test('ticket protection becomes the same plan the paper engine manages for strategies', () => {
  const plan = manualPlan(protection({ breakeven: 'target1', trailing: 'after1R' }), 'intraday', 100000);
  assert.equal(plan.overnight, false); assert.equal(plan.stopMode, 'fixed'); assert.equal(plan.stopPercent, 2); assert.equal(plan.feePercent, 0.05);
  assert.deepEqual(plan.stopManagement, { breakeven: { trigger: 'target', at: 1 }, trailing: { trigger: 'risk', at: 1, distanceR: 1 } });
  const entry = 100_00, distance = initialRiskDistance(plan, entry);
  assert.equal(distance, 2_00);
  assert.deepEqual(positionTargets(plan, entry, 10, distance)!.map(t => [t.pricePaise, t.quantity]), [[103_00, 5], [106_00, 5]]);
  const price = manualPlan({ stop: { mode: 'price', value: 95.5 }, targets: [{ basis: 'price', value: 110, sellPercent: 100 }], breakeven: 'off', trailing: 'off' }, 'delivery', 50000);
  assert.equal(initialRiskDistance(price, entry), 4_50); assert.equal(price.overnight, true);
  assert.deepEqual(positionTargets(price, entry, 7, 4_50)!.map(t => [t.pricePaise, t.quantity]), [[110_00, 7]], 'a single target sells everything');
  const none = manualPlan({ stop: { mode: 'trailing', value: 3 }, targets: [], breakeven: 'off', trailing: 'off' }, 'delivery', 50000);
  assert.equal(none.noTarget, true); assert.equal(positionTargets(none, entry, 5, 3_00), undefined);
  // The trailing stop follows the highest price and never moves down.
  const position = { stopPaise: 97_00, entryPaise: entry, initialRiskPaise: 3_00, quantity: 5 } as PaperPosition;
  const up = advanceStop(position, none, 110_00); assert.equal(up.stopPaise, 106_70);
  assert.equal(advanceStop({ ...position, ...up }, none, 104_00).stopPaise, 106_70);
});

test('manual quantities are limited by cash, not by a strategy risk percentage', () => {
  const plan = manualPlan(protection(), 'delivery', 100000);
  const session = { mode: 'manual', cashPaise: 100000_00, strategy: { risk: { ...plan, riskPercent: 0.1 } } } as unknown as PaperSession;
  const order = { side: 'BUY', quantity: 900, plan, orderType: 'market' } as unknown as PaperOrder;
  const quote = { price: 100, at: new Date().toISOString(), receivedAt: new Date().toISOString(), instrumentId: 'NSE:1', symbol: 'X', exchange: 'NSE' as const, cumulativeVolume: 0, source: 'motilal' as const, session: 's' };
  const estimate = orderEstimate(order, session, [], quote);
  assert.equal(estimate.quantity, 900, '₹90,000 of a ₹1,00,000 account is allowed manually');
  assert.equal(orderEstimate({ ...order, quantity: 2000 } as PaperOrder, session, [], quote).message, 'Not enough paper cash for this quantity.');
  const strategySession = { ...session, mode: 'automatic' } as PaperSession;
  assert.ok(buySize(strategySession, [], 100_05, 2_00, strategySession.strategy.risk).maxRisk < 900, 'strategy sessions still cap by risk %');
});
