export interface StockQuote {
  instrumentId: string;
  price: number; previousClose: number | null; change: number | null; percent: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null;
  averagePrice: number | null; lowerCircuit: number | null; upperCircuit: number | null;
  lastTradeAt: string | null; receivedAt: string;
  source: 'dhan-snapshot' | 'dhan-stream' | 'historical-close';
}
export interface ChartBar { time: string; open: number; high: number; low: number; close: number; volume: number }
export type StockTimeframe = '1m' | '5m' | '15m' | '1d' | '1w' | '1mo';
export type StreamStatus = { state: 'connecting' | 'streaming' | 'reconnecting' | 'unavailable'; message?: string };
