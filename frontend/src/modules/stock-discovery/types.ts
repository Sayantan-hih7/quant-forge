import type { StockQuote } from '../stock-details/types';
export interface DiscoveryEvidence { field: string; label: string; value: number; unit: string; source: string; observedAt: string; period?: string; statementBasis?: string }
export interface DiscoveryMatchData { rank: number; checks: DiscoveryEvidence[]; quote?: StockQuote }
export interface DiscoveryGroup {
  id: string; name: string; description: string; family: 'session' | 'company';
  criteria: { field: string; label: string; operator: string; value: number; unit: string }[];
  rankBy: string; rankLabel: string;
  coverage: { total: number; available: number; missing: number; matched: number };
}
export interface DiscoveryState {
  groups: DiscoveryGroup[]; refreshing: boolean; sessionDate: string | null; capturedAt: string | null;
  captureStartedAt: string | null; factsCheckedAt: string; warning: string | null; version: string; stale: boolean;
  market: { open: boolean; reason: string; nextOpenAt: string | null };
}
