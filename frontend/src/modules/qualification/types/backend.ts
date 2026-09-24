import type { MonthlyRuleDefinition } from './monthly';
import type { UniverseRefresh } from '../../data-sources/types';

export interface RuleCapabilities {
  monthlyFields: string[]; technical: string[]; snapshotFields: string[];
  choices: Record<string, { value: string; label: string }[]>;
}
export interface BackendScan {
  _id: string; month: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  cutoff: string; total: number; processed: number; qualified: number; rejected: number; unavailable: number; message?: string;
  revision: number; fingerprint: string;
  stage?: 'checking' | 'fundamentals' | 'history' | 'evaluating';
  preparation?: { processed: number; total: number; downloaded: number; cached: number; failed: number; ruledOut: number; failures: { instrumentId: string; message: string }[] };
}
export interface QualificationState {
  providerRetryAt?: string | null;
  readiness?: { companies: number; checkedAt: string; fields: { field: string; kind: 'fact' | 'history'; withData: number; requiredMonths?: number }[]; universeRefresh: UniverseRefresh };
  month: string; canRun: boolean;
  rule: { rule: MonthlyRuleDefinition; revision: number; fingerprint: string } | null;
  universe: { runId: string; publishedAt: string; fingerprint: string; members: { instrumentId: string; source: 'scan' | 'manual' }[] } | null;
  runs: BackendScan[];
}
export interface QualifiedStock {
  instrumentId: string; isin: string; source: 'scan' | 'manual'; addedAt: string; note?: string;
  instrument?: { symbol: string; name: string; exchange: string };
  metrics: Record<string, number | string | string[]>;
}
