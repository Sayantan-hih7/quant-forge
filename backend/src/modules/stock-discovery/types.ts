import type { StockQuote } from '../stock-details/types.js';
import type { Instrument } from '../market-data/types.js';

export type Metric = 'price' | 'percent' | 'turnover' | 'aboveVwap' | 'marketCap' | 'roe' | 'debtEquity';
export interface DiscoveryQuote extends StockQuote { changeSource?: 'nse-bhavcopy' }
export interface Criterion { field: Metric; label: string; operator: '>' | '>=' | '<' | '<='; value: number; unit: string }
export interface DiscoveryGroup {
  id: string; name: string; description: string; family: 'session' | 'company';
  criteria: Criterion[]; rankBy: Metric; rankLabel: string; ascending?: boolean;
}
export interface Evidence {
  field: Metric; label: string; value: number; unit: string; source: string;
  observedAt: string; period?: string; statementBasis?: string;
}
export interface DiscoveryStock extends Pick<Instrument, '_id' | 'symbol' | 'name' | 'isin' | 'exchange' | 'active'> {
  discovery: { rank: number; checks: Evidence[]; quote?: StockQuote };
}
export interface QuoteSnapshot {
  _id: string; quotes: DiscoveryQuote[]; sessionDate?: string; startedAt?: string; completedAt?: string;
  attemptedAt?: string; warning?: string;
}
