import type { ChartBar, StockTimeframe } from '../../stock-details/types';
export interface ReplayCheck { field: string; matched: boolean | null; left?: number; right?: number; reason?: string }
export interface ReplayEvent {
  kind: 'signal' | 'entry' | 'exit' | 'stop'; instrumentId: string; entryAt: string; at: string;
  phase: 'open' | 'close'; sequence: number; side?: string; fillAt?: string;
  price?: number; quantity?: number; remainingQuantity?: number; pnl?: number;
  stop?: number; previousStop?: number; initialRisk?: number; effective?: string; reason?: string;
  targets?: { number: number; price: number; quantity: number }[];
  checks?: ReplayCheck[]; candle?: ChartBar & { end: string; timeframe: string };
}
export interface BacktestReplayView {
  instrumentId: string; revision: number; timeframe: '1d' | '1m'; source: 'recorded' | 'verified-reconstruction' | 'fills-only';
  events: ReplayEvent[]; frames: Partial<Record<StockTimeframe, ChartBar[]>>; warnings: string[]; preparedAt: string;
}
