import type { ChartEvent } from '../../stock-details/types';
import type { BackendBacktest } from '../types/backend';

export type BacktestFill = NonNullable<BackendBacktest['result']>['trades'][number];
export type TradeOutcome = 'Win' | 'Loss' | 'Breakeven' | 'Open' | 'Incomplete';
export interface BacktestPosition {
  id: string; instrumentId: string; entryAt?: string; exitAt?: string; entry: number;
  quantity: number; soldQuantity: number; remainingQuantity: number; averageExit?: number;
  realizedPnl: number; unrealizedPnl: number; totalPnl: number; outcome: TradeOutcome;
  fills: BacktestFill[]; mark?: number;
}
export interface BacktestStockResult {
  instrumentId: string; symbol: string; positions: BacktestPosition[];
  totalTrades: number; closedTrades: number; wins: number; losses: number; breakeven: number;
  winRate: number | null; openQuantity: number; incomplete: number;
  realizedPnl: number; unrealizedPnl: number; totalPnl: number;
}
const cents = (value: number) => Math.round(value * 100);
const total = (values: number[]) => values.reduce((sum, value) => sum + cents(value), 0) / 100;
const key = (instrumentId: string, at: string) => `${instrumentId}:${Date.parse(at)}`;

/** Exit fills share one entry. A partial target is never a separate winning trade. */
export function backtestStockResults(run: BackendBacktest): BacktestStockResult[] {
  const groups = new Map<string, BacktestPosition>();
  for (const fill of run.result?.trades ?? []) {
    const id = key(fill.instrumentId, fill.entryAt);
    const position = groups.get(id) ?? {
      id, instrumentId: fill.instrumentId, entryAt: fill.entryAt, entry: fill.entry,
      quantity: 0, soldQuantity: 0, remainingQuantity: 0, realizedPnl: 0, unrealizedPnl: 0,
      totalPnl: 0, outcome: 'Incomplete' as const, fills: [],
    };
    position.fills.push(fill); groups.set(id, position);
  }
  for (const p of groups.values()) p.fills.sort((a, b) => Date.parse(a.exitAt) - Date.parse(b.exitAt));
  const openIds = new Set<string>();
  const unknownOpenSymbols = new Set<string>();
  for (const open of run.result?.openPositions ?? []) {
    // Older reports may omit the open entry time. Link only to an explicitly unfinished entry.
    const unfinished = [...groups.values()].filter(p => p.instrumentId === open.instrumentId &&
      (p.fills.at(-1)?.remainingQuantity ?? 0) > 0 && cents(p.entry) === open.entry);
    const id = open.entryAt ? key(open.instrumentId, open.entryAt) : unfinished.length === 1 ? unfinished[0].id : `${open.instrumentId}:open`;
    const p = groups.get(id) ?? {
      id, instrumentId: open.instrumentId, entryAt: open.entryAt, entry: open.entry / 100,
      quantity: 0, soldQuantity: 0, remainingQuantity: 0, realizedPnl: 0, unrealizedPnl: 0,
      totalPnl: 0, outcome: 'Open' as const, fills: [],
    };
    if (!open.entryAt && !p.entryAt) unknownOpenSymbols.add(open.instrumentId);
    p.remainingQuantity = open.quantity;
    p.unrealizedPnl = (cents(open.mark) * open.quantity - open.cost) / 100;
    p.mark = open.mark; p.outcome = 'Open';
    groups.set(id, p); openIds.add(id);
  }
  for (const p of groups.values()) {
    const last = p.fills.at(-1);
    p.soldQuantity = p.fills.reduce((sum, fill) => sum + fill.quantity, 0);
    p.realizedPnl = total(p.fills.map(fill => fill.pnl));
    if (!openIds.has(p.id)) {
      p.remainingQuantity = last?.remainingQuantity ?? 0;
      const closed = !!last && (last.remainingQuantity === 0 ||
        (last.remainingQuantity === undefined && !unknownOpenSymbols.has(p.instrumentId)));
      p.outcome = !closed ? 'Incomplete' : p.realizedPnl > 0 ? 'Win' : p.realizedPnl < 0 ? 'Loss' : 'Breakeven';
      if (closed) p.exitAt = last.exitAt;
    }
    p.quantity = p.soldQuantity + p.remainingQuantity;
    p.averageExit = p.soldQuantity ? p.fills.reduce((sum, fill) => sum + fill.exit * fill.quantity, 0) / p.soldQuantity : undefined;
    p.totalPnl = total([p.realizedPnl, p.unrealizedPnl]);
  }
  const ids = new Set([...run.config.ids, ...(run.result?.coverage ?? []).map(c => c.instrumentId), ...[...groups.values()].map(p => p.instrumentId)]);
  return [...ids].map(instrumentId => {
    const positions = [...groups.values()].filter(p => p.instrumentId === instrumentId)
      .sort((a, b) => Date.parse(a.entryAt ?? '') - Date.parse(b.entryAt ?? ''));
    const wins = positions.filter(p => p.outcome === 'Win').length;
    const losses = positions.filter(p => p.outcome === 'Loss').length;
    const breakeven = positions.filter(p => p.outcome === 'Breakeven').length;
    const closedTrades = wins + losses + breakeven;
    const realizedPnl = total(positions.map(p => p.realizedPnl)), unrealizedPnl = total(positions.map(p => p.unrealizedPnl));
    return {
      instrumentId, symbol: run.symbols?.[instrumentId] ?? instrumentId, positions,
      totalTrades: positions.length, closedTrades, wins, losses, breakeven,
      winRate: closedTrades ? wins / closedTrades * 100 : null,
      openQuantity: positions.filter(p => p.outcome === 'Open').reduce((sum, p) => sum + p.remainingQuantity, 0),
      incomplete: positions.filter(p => p.outcome === 'Incomplete').length,
      realizedPnl, unrealizedPnl, totalPnl: total([realizedPnl, unrealizedPnl]),
    };
  });
}

export function backtestPositionEvents(position: BacktestPosition): ChartEvent[] {
  return [
    ...(position.entryAt ? [{ id: `${position.id}:entry`, kind: 'backtest' as const, side: 'BUY', at: position.entryAt,
      price: position.entry, quantity: position.quantity, label: 'Simulated backtest entry' }] : []),
    ...position.fills.map((fill, i) => ({ id: `${position.id}:exit:${i}`, kind: 'backtest' as const, side: 'SELL',
      at: fill.exitAt, price: fill.exit, quantity: fill.quantity, label: fill.reason })),
  ];
}
