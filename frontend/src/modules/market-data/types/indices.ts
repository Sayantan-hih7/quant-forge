export type IndexCategory = "derivatives" | "broad" | "sectoral";
export type IndexExchange = "NSE" | "BSE";
export type IndexDirection = "up" | "down" | "flat" | "unknown";
export interface IndexDefinition {
  id: string;
  exchange: IndexExchange;
  name: string;
  family: "broad" | "sectoral";
  derivativeSymbol?: string;
  derivativeSource?: string;
  volatility?: boolean;
}
export interface IndexQuote extends IndexDefinition {
  last: number | null;
  previousClose: number | null;
  change: number | null;
  percent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  high52w: number | null;
  low52w: number | null;
  series: number[];
  points?: { time: number; value: number }[];
  chartKind?: "observed" | "intraday" | "daily";
  asOf?: string;
  fetchedAt?: string;
  source?: string;
  sourceUrl?: string;
  status?: "snapshot" | "eod" | "stale" | "unavailable";
  tickDirection?: "up" | "down";
  references?: { label: string; value: number; date: string }[];
  advances?: number | null; declines?: number | null; unchanged?: number | null;
  pe?: number | null; pb?: number | null; dividendYield?: number | null;
}
