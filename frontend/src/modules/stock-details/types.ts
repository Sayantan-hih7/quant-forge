import type { MonthlyRuleDefinition } from '../qualification/types/monthly';
export interface StockQuote {
  instrumentId: string; price: number; previousClose: number | null; change: number | null; percent: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null; averagePrice: number | null;
  lowerCircuit: number | null; upperCircuit: number | null; lastTradeAt: string | null; receivedAt: string;
  source: 'dhan-snapshot' | 'dhan-stream' | 'historical-close';
}
export interface StockFact { field: string; value: number | string | string[]; period?: string; observedAt: string; source: string }
export interface StockDetail {
  message?: string;
  instrument: { _id: string; symbol: string; name: string; exchange: string; isin: string };
  facts: StockFact[];
  qualification: null | { source: 'scan' | 'manual'; month: string; note?: string; addedAt: string; cutoff: string | null; rule: MonthlyRuleDefinition | null;
    checks: { field: string; matched: boolean | null; reason?: string; left?: number | string; right?: number | string }[] };
}
export type StockTimeframe = '1m' | '5m' | '15m' | '1d' | '1w' | '1mo';
export interface ChartBar { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface StockChartData { instrumentId: string; timeframe: StockTimeframe; bars: ChartBar[]; message?: string; source: string; refreshedAt: string }
export interface QuoteStatus { state: 'connecting' | 'streaming' | 'reconnecting' | 'unavailable'; message?: string }
