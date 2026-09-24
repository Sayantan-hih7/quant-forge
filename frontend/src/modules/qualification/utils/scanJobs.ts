import type { ScanJob } from '../types';

export const isScanActive = (job: ScanJob) => job.status === 'queued' || job.status === 'running';
export const scanDuration = (job: Pick<ScanJob, 'kind'>) => job.kind === 'tactical' ? 12_000 : 30_000;
export function advanceProgress(job: ScanJob, now: number): ScanJob {
  const elapsed = Math.max(0, now - job.createdAt);
  const ratio = Math.min(1, elapsed / scanDuration(job));
  const phase = ratio < .12 ? 'queued' : ratio < .32 ? 'loading' : ratio < .88 ? 'evaluating' : ratio < 1 ? 'finalizing' : 'done';
  return { ...job, phase, status: phase === 'queued' ? 'queued' : 'running', updatedAt: now,
    progress: Math.floor(ratio * 100), processed: Math.floor(job.scopeCount * Math.max(0, Math.min(1, (ratio - .32) / .56))) };
}
export const scanTitles = { monthly: 'Monthly qualification', trial: 'Base preset trial', tactical: 'Tactical signal scan' };
export const scanStatusLabels = { queued: 'Queued', running: 'Scanning', ready: 'Ready for review', completed: 'Completed', cancelled: 'Cancelled', failed: 'Failed', interrupted: 'Interrupted' };
