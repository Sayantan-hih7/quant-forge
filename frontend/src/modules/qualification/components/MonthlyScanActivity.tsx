import { useState } from 'react';
import { Alert, App, Button } from 'antd';
import { formatMonth } from '../../strategies/utils/monthlyCycle';
import { useQualificationStore } from '../store/qualificationStore';
import { monthlyScanPending } from '../utils/monthlyRuleChanges';
import { isScanActive } from '../utils/scanJobs';
import { ScanJobPanel } from './ScanJobPanel';
import { ScanResultDrawer } from './ScanResultDrawer';
import type { QualificationWorkspace } from '../types';

export function MonthlyScanActivity({ owner, workspace, month, dirty, onPublished }: { owner: string; workspace: QualificationWorkspace; month: string; dirty: boolean; onPublished: (month: string) => void }) {
  const [reviewId, setReviewId] = useState<string | null>(null);
  const actions = useQualificationStore();
  const { message } = App.useApp();
  const jobs = workspace.jobs.filter((job) => job.kind === 'monthly' && job.rules[0].tier === 'monthly' && job.month === month);
  const job = jobs[0];
  const review = jobs.find((item) => item.id === reviewId) ?? null;
  if (!job || ['completed', 'cancelled'].includes(job.status)) return null;
  const retry = () => { if (!actions.retryScan(owner, job.id)) message.warning('The stock list changed. Use Run to scan your latest saved rules.'); };
  const retryDisabled = monthlyScanPending(workspace, month) || dirty || workspace.caches[month]?.id !== job.cacheId;
  if (!isScanActive(job) && job.status !== 'ready') return <div className="monthly-scan-activity"><Alert className="monthly-scan-recovery" showIcon type="warning" closable onClose={() => actions.cancelScan(owner, job.id)} title={job.status === 'interrupted' ? 'Scan interrupted' : 'Scan could not finish'} description={job.error} action={<Button size="small" disabled={retryDisabled} onClick={retry}>Retry scan</Button>} /></div>;
  return <div className="monthly-scan-activity">
    <ScanJobPanel job={job} onCancel={() => actions.cancelScan(owner, job.id)} onRetry={retry} onReview={() => setReviewId(job.id)} retryDisabled={retryDisabled} stale={job.rules[0].tier === 'monthly' && job.rules[0].revision !== workspace.monthlyRule.revision} />
    <ScanResultDrawer job={review} month={month} replacementCount={review ? workspace.caches[review.month]?.candidates.length : undefined} onClose={() => setReviewId(null)} onDiscard={() => { if (review) actions.cancelScan(owner, review.id); setReviewId(null); }} onPublish={() => { if (review && actions.publishScan(owner, review.id)) { setReviewId(null); message.success(`Universe published for ${formatMonth(review.month)}.`); onPublished(review.month); } else message.warning('The source list or target month has changed. Start a fresh scan.'); }} />
  </div>;
}
