import type { MonthlyCache, QualificationWorkspace } from '../types';
import { monthlyScanPending } from './monthlyRuleChanges';
import { isScanActive } from './scanJobs';

export const canEditQualifiedStocks = (workspace: QualificationWorkspace, month: string, currentMonth: string) =>
  month === currentMonth && !!workspace.caches[month] && !monthlyScanPending(workspace, month) && !workspace.jobs.some((job) => job.month === month && job.kind !== 'trial' && isScanActive(job));

// Additions belong to this month's published list. A refreshed scan retains their provenance.
export function retainManualStocks(result: MonthlyCache, published?: MonthlyCache): MonthlyCache {
  const additions = published?.candidates.filter((stock) => stock.qualificationSource === 'manual') ?? [];
  const candidates = new Map(result.candidates.map((stock) => [stock.symbol, stock]));
  for (const stock of additions) candidates.set(stock.symbol, { ...(candidates.get(stock.symbol) ?? stock), qualificationSource: 'manual', manualAddedAt: stock.manualAddedAt, manualSelectionNote: stock.manualSelectionNote });
  return { ...result, candidates: [...candidates.values()] };
}
