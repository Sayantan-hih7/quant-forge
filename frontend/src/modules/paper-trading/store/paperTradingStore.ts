import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { positionSize, stopDistance } from '../../backtesting/api/mockBacktest';
import type { BacktestRun, BacktestScope } from '../../backtesting/types';
import type { PaperEvent, PaperSession } from '../types';
import { useDemoStore } from '../../../store/demoStore';
import { useQualificationStore } from '../../qualification/store/qualificationStore';
import { monthKey } from '../../strategies/utils/monthlyCycle';
import type { MonitorSignal } from '../../signals/types/monitor';

export function refreshPaperScope(owner: string, session: PaperSession): PaperSession {
  const candidates = useQualificationStore.getState().workspaces[owner]?.caches[monthKey(Date.now())]?.candidates ?? [];
  const held = session.scope.symbols.filter(stock => session.positions.some(position => position.symbol === stock.symbol));
  const symbols = candidates.map(stock => held.find(item => item.symbol === stock.symbol) ?? { symbol: stock.symbol, price: stock.close, manual: stock.qualificationSource === 'manual' });
  for (const stock of held) if (!symbols.some(item => item.symbol === stock.symbol)) symbols.push(stock);
  return { ...session, scope: { mode: 'current', label: 'Current monthly candidates + retained holdings', symbols, manualCount: candidates.filter(stock => stock.qualificationSource === 'manual').length } };
}

export function paperQuote(session: PaperSession, symbol: string) {
  const stock = session.scope.symbols.find((item) => item.symbol === symbol);
  return stock ? stock.price * (1 + Math.sin(session.tick * 0.8 + session.scope.symbols.indexOf(stock)) * 0.005) : 0;
}
export const paperEquity = (session: PaperSession) => session.cash + session.positions.reduce((sum, position) => sum + paperQuote(session, position.symbol) * position.quantity, 0);
export const maxPaperQuantity = (session: PaperSession, symbol: string) => positionSize(paperEquity(session), session.cash, paperQuote(session, symbol), session.config);

function buy(session: PaperSession, symbol: string, quantity: number, source: PaperEvent['source'], reason: string): PaperSession | string {
  if (useDemoStore.getState().enginePaused) return 'Engine paused. New buys are disabled; sell exits remain available.';
  if (source !== 'Manual' && session.paused) return 'New algo entries are paused. Manual buys and sell exits remain available.';
  if (!session.scope.symbols.some((stock) => stock.symbol === symbol)) return 'Choose a stock from this session’s qualified list.';
  if (session.positions.some((position) => position.symbol === symbol)) return 'This stock already has an open position.';
  if (session.positions.length >= session.config.maxPositions) return 'The maximum open-position limit has been reached.';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxPaperQuantity(session, symbol)) return 'Quantity exceeds available cash or the risk-based position limit.';
  const price = paperQuote(session, symbol) * (1 + session.config.slippagePercent / 100);
  const fees = price * quantity * session.config.feePercent / 100;
  const distance = stopDistance(price, session.config);
  const event: PaperEvent = { id: crypto.randomUUID(), symbol, quantity, price, fees, side: 'BUY', source, reason, time: Date.now() };
  return { ...session, cash: session.cash - price * quantity - fees, positions: [...session.positions, { id: event.id, symbol, quantity, entry: price, entryFee: fees, stop: price - distance, target: price + distance * session.config.targetR, source, openedAt: event.time }], events: [event, ...session.events] };
}
function sell(session: PaperSession, positionId: string, source: PaperEvent['source'], reason: string, pause: boolean): PaperSession {
  const position = session.positions.find((item) => item.id === positionId);
  if (!position) return session;
  const price = paperQuote(session, position.symbol) * (1 - session.config.slippagePercent / 100);
  const fees = price * position.quantity * session.config.feePercent / 100;
  const pnl = (price - position.entry) * position.quantity - fees - position.entryFee;
  return { ...session, cash: session.cash + price * position.quantity - fees, realized: session.realized + pnl, paused: session.paused || pause, positions: session.positions.filter((item) => item.id !== positionId), events: [{ id: crypto.randomUUID(), symbol: position.symbol, side: 'SELL', quantity: position.quantity, price, fees, pnl, source, reason, time: Date.now() }, ...session.events] };
}
interface PaperState {
  sessions: Record<string, PaperSession[]>;
  start: (owner: string, run: BacktestRun, scope: BacktestScope) => string | null;
  buyManual: (owner: string, id: string, symbol: string, quantity: number, reason: string) => string | null;
  sellManual: (owner: string, id: string, positionId: string) => void;
  sellAll: (owner: string, id: string) => void;
  setPaused: (owner: string, id: string, paused: boolean) => void;
  fillSignal: (owner: string, id: string, signal: MonitorSignal, quantity: number) => string | null;
}
export const usePaperTradingStore = create<PaperState>()(persist((set, get) => {
  const update = (owner: string, id: string, action: (session: PaperSession) => PaperSession) => set((state) => ({ sessions: { ...state.sessions, [owner]: (state.sessions[owner] ?? []).map((session) => session.id === id ? action(session) : session) } }));
  return {
    sessions: {},
    start: (owner, run, scope) => {
      if (run.status !== 'completed' || !run.result || !scope.symbols.length || scope.mode !== 'current') return null;
      const existing = get().sessions[owner]?.find((session) => session.runId === run.id);
      if (existing) return existing.id;
      const session: PaperSession = structuredClone({ id: crypto.randomUUID(), runId: run.id, name: run.entryRule.name.replace(/ · Buy$/, ""), createdAt: Date.now(), config: run.config, entryRule: run.entryRule, exitRule: run.exitRule, scope, cash: run.config.initialCapital, realized: 0, paused: false, tick: 0, positions: [], events: [] });
      set((state) => ({ sessions: { ...state.sessions, [owner]: [session, ...(state.sessions[owner] ?? [])] } })); return session.id;
    },
    buyManual: (owner, id, symbol, quantity, reason) => {
      const session = get().sessions[owner]?.find((item) => item.id === id);
      if (!session) return 'Session unavailable.';
      if (!useQualificationStore.getState().workspaces[owner]?.caches[monthKey(Date.now())]?.candidates.some(stock => stock.symbol === symbol)) return 'This stock is outside the current qualified list. Existing holdings can still be sold.';
      const result = buy(refreshPaperScope(owner, session), symbol, quantity, 'Manual', reason.trim().slice(0, 200) || 'Manual buy override');
      if (typeof result === 'string') return result;
      update(owner, id, () => result); return null;
    },
    fillSignal: (owner, id, signal, quantity) => {
      const saved = get().sessions[owner]?.find(item => item.id === id);
      if (!saved || saved.events.some(event => event.signalId === signal.id)) return 'This alert is already handled or the paper session is unavailable.';
      const session = refreshPaperScope(owner, saved);
      const position = session.positions.find(item => `${session.id}:${item.id}` === signal.positionId);
      if (signal.side === 'SELL' && !position) return 'The held position has already been closed.';
      const result = signal.side === 'BUY' ? buy(session, signal.symbol, quantity, 'Signal', 'Confirmed BUY alert from Signal Runner') : sell(session, position!.id, 'Signal', `Confirmed ${signal.trigger.toLowerCase()} alert from Signal Runner`, false);
      if (typeof result === 'string') return result;
      result.events[0] = { ...result.events[0], signalId: signal.id };
      update(owner, id, () => result); return null;
    },
    sellManual: (owner, id, positionId) => update(owner, id, (session) => sell(session, positionId, 'Manual', 'Manual sell override · new algo entries paused', true)),
    sellAll: (owner, id) => update(owner, id, (session) => session.positions.reduce<PaperSession>((current, position) => sell(current, position.id, 'Manual', 'Exit all & pause', true), { ...session, paused: true })),
    setPaused: (owner, id, paused) => update(owner, id, (session) => ({ ...session, paused })),
  };
}, { name: 'quantforge-paper-sessions', version: 1 }));
