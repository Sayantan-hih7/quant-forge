export type Exchange = 'NSE' | 'BSE';
export interface Instrument {
  _id: string; exchange: Exchange; securityId: string; isin: string; symbol: string;
  name: string; series: string; lotSize: number; active: boolean; observedAt: string;
  primary: boolean; motilalCode?: number;
}
export type FactValue = number | string | string[] | boolean;
export interface Fact {
  _id: string; instrumentId: string; field: string; value: FactValue;
  source: string; sourceUrl: string; observedAt: string; knownAt: string;
  period?: string; validUntil?: string; basis: 'observed-snapshot' | 'published-report' | 'derived';
}
export interface DeliveryDay {
  _id: string; instrumentId: string; date: string; volume: number;
  deliverable: number | null; turnoverCr: number; source: string; sourceUrl: string;
  observedAt: string; knownAt: string;
}
export interface Candle {
  instrumentId: string; interval: '1d' | '1m'; time: string;
  open: number; high: number; low: number; close: number; volume: number;
  source: string; observedAt: string;
}
export interface SourceRun {
  _id: string; source: string; status: 'running' | 'completed' | 'partial' | 'failed';
  startedAt: string; finishedAt?: string; processed: number; total?: number;
  failures: { item: string; message: string }[]; details?: Record<string, unknown>;
}
