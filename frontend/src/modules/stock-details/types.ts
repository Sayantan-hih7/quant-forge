import type { MonthlyRuleDefinition } from '../qualification/types/monthly';
export interface StockQuote {
  instrumentId: string; price: number; previousClose: number | null; change: number | null; percent: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null; averagePrice: number | null;
  lowerCircuit: number | null; upperCircuit: number | null; lastTradeAt: string | null; receivedAt: string;
  source: 'dhan-snapshot' | 'dhan-stream' | 'motilal-stream' | 'historical-close';
  streamSession?: string;
}
export interface StockFact { field: string; value: number | string | string[]; period?: string; observedAt: string; source: string; sourceUrl?: string; ownership?: { evidence: string }; statementBasis?: 'consolidated' | 'standalone'; calculation?: { method: string } }
export interface StockDetail {
  message?: string;
  instrument: { _id: string; symbol: string; name: string; exchange: string; isin: string };
  facts: StockFact[];
  qualification: null | { source: 'scan' | 'manual'; month: string; note?: string; addedAt: string; cutoff: string | null; rule: MonthlyRuleDefinition | null;
    checks: { field: string; matched: boolean | null; reason?: string; left?: number | string; right?: number | string }[] };
}
export type StockTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1mo';
export interface ChartBar { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface LiveChartBar extends ChartBar { instrumentId: string; partial: boolean; updatedAt: string; streamSession?: string }
export interface StockChartData { instrumentId: string; timeframe: StockTimeframe; bars: ChartBar[]; baseBars?: ChartBar[]; incompleteBuckets?: number; message?: string; latestCandleAt?: string | null; source: string; refreshedAt: string }
export interface QuoteStatus { state: 'connecting' | 'streaming' | 'reconnecting' | 'unavailable'; message?: string; sessions?: Record<string, string>; providers?: string[]; unavailableIds?: string[]; marketClosed?: boolean }
export interface StockSelection { instrumentId: string; instrument?: { symbol: string; name?: string; exchange: string }; isin?: string; source?: 'scan' | 'manual'; metrics?: Record<string, unknown>; note?: string }
export interface ChartEvent { id: string; kind: 'signal' | 'fill' | 'backtest'; side: string; at: string; price?: number; quantity?: number; label: string }
export interface ChartLevel { id: string; label: string; price: number; kind: 'entry' | 'stop' | 'initial-stop' | 'target' }
