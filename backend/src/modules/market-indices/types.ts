export type IndexExchange = 'NSE' | 'BSE';
export interface IndexInstrument {
  id: string; name: string; exchange: IndexExchange; providerName?: string; providerCode?: string; niftyName?: string;
}
export interface IndexPoint { time: number; value: number }
export interface IndexSnapshot {
  id: string; exchange: IndexExchange; name: string;
  last: number; previousClose: number | null; change: number | null; percent: number | null;
  open: number | null; high: number | null; low: number | null; high52w: number | null; low52w: number | null;
  asOf: string; fetchedAt: string; source: string; sourceUrl: string; kind: 'snapshot' | 'eod';
  points: IndexPoint[]; chartKind: 'observed' | 'intraday' | 'daily';
  references?: { label: string; value: number; date: string }[];
  advances?: number | null; declines?: number | null; unchanged?: number | null;
  pe?: number | null; pb?: number | null; dividendYield?: number | null;
}
