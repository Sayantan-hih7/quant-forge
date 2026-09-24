export interface SourceRun {
  _id: string; source: string; status: 'running' | 'completed' | 'partial' | 'failed';
  processed: number; total?: number; startedAt: string; finishedAt?: string;
  failures: { item: string; message: string }[]; details?: Record<string, unknown>;
}
export interface DataStatus {
  universeRefresh?: UniverseRefresh;
  listings: number; companies: number; recentRuns: SourceRun[];
  coverage: { _id: string; instruments: number; latestObservation: string }[];
  candles: { _id: string; count: number; from: string; to: string }[];
  dhan: { connected: boolean; expiresAt?: string; dataPlan?: string; apiConfigured: boolean; hasSavedToken: boolean;
    tokenSource: 'web' | 'oauth' | 'unknown'; autoRenew: boolean;
    renewalState: 'off' | 'scheduled' | 'verifying' | 'retrying' | 'login_required';
    nextRenewalAt?: string; lastRenewedAt?: string; renewalError?: string };
  indices: { id: string; name: string; exchange: string; url: string }[];
  limitations: string[];
}
export interface UniverseRefresh {
  scheduled: boolean; workerOnline: boolean; schedule: string; timezone: string;
  nextRunAt: string | null; lastSuccessAt: string | null; upToDate: boolean;
  latestStatus: string | null; lastError: string | null; addedListings: number | null; addedCompanies: number | null;
}
