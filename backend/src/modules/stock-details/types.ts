export interface StockQuote {
  depth?: StockDepth;
  instrumentId: string;
  price: number; previousClose: number | null; change: number | null; percent: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null;
  averagePrice: number | null; lowerCircuit: number | null; upperCircuit: number | null;
  lastTradeAt: string | null; receivedAt: string;
  source: 'dhan-snapshot' | 'dhan-stream' | 'motilal-stream' | 'historical-close';
  streamSession?: string;
}
export interface StockDepth { bids:{price:number;quantity:number;orders:number|null}[]; asks:{price:number;quantity:number;orders:number|null}[]; totalBuy:number|null; totalSell:number|null; receivedAt:string; source:'Dhan snapshot' }
export interface ChartBar { time: string; open: number; high: number; low: number; close: number; volume: number }
export type StockTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1mo';
export interface LiveChartBar extends ChartBar { instrumentId: string; partial: boolean; updatedAt: string; streamSession?: string }
export type StreamStatus = { state: 'connecting' | 'streaming' | 'reconnecting' | 'unavailable'; message?: string; sessions?: Record<string, string>; providers?: string[]; unavailableIds?: string[]; marketClosed?: boolean };
