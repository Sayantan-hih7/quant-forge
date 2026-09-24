import '../../../styles/scan-jobs.css';
import { Button, Progress, Tag } from 'antd';
import { ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { isScanActive, scanStatusLabels, scanTitles } from '../utils/scanJobs';
import type { ScanJob } from '../types';

export function ScanJobPanel({ job, onCancel, onRetry, onReview, retryDisabled = false, stale = false }: {
  job: ScanJob; onCancel: () => void; onRetry: () => void; onReview?: () => void; retryDisabled?: boolean; stale?: boolean;
}) {
  const active = isScanActive(job);
  const elapsed = Math.max(0, Math.floor((job.updatedAt - job.createdAt) / 1000));
  const phases = ['Queued', 'Preparing data', 'Evaluating rules', 'Finalizing results'];
  const phaseIndex = ['queued', 'loading', 'evaluating', 'finalizing', 'done'].indexOf(job.phase);
  const trouble = ['failed', 'interrupted', 'cancelled'].includes(job.status);
  const manualCount = job.result?.candidates.filter((stock) => stock.qualificationSource === 'manual').length ?? 0;
  const resultSummary = manualCount
    ? `${(job.result?.candidates.length ?? 0) - manualCount} from scan · ${manualCount} manual ${manualCount === 1 ? 'inclusion' : 'inclusions'} retained.`
    : `${job.result?.candidates.length ?? 0} candidates found across ${job.scopeCount.toLocaleString('en-IN')} stocks.`;
  return <section className="q-scan-job" aria-label={`${scanTitles[job.kind]} job`}>
    <header><div><span className="q-job-icon"><ClockCircleOutlined /></span><div><strong>{scanTitles[job.kind]}</strong><p>{job.kind === 'monthly' ? 'Saved monthly conditions' : job.rules.map((rule) => `${rule.name} · v${rule.revision}`).join(' / ')} · {job.month}</p></div></div><Tag color={trouble ? 'orange' : active ? 'blue' : 'green'}>{scanStatusLabels[job.status]}</Tag></header>
    {active && <><div className="q-job-phases">{phases.map((phase, i) => <span key={phase} className={phaseIndex === i ? 'current' : phaseIndex > i ? 'done' : ''}><i>{phaseIndex > i ? '✓' : i + 1}</i>{phase}</span>)}</div><Progress percent={job.progress} size="small" status="active" showInfo={false} /><div className="q-job-progress"><span>{job.phase === 'queued' ? 'Waiting for a scan worker' : job.phase === 'loading' ? 'Preparing price history and required indicators' : job.phase === 'evaluating' ? `${job.processed.toLocaleString('en-IN')} / ${job.scopeCount.toLocaleString('en-IN')} stocks evaluated` : 'Validating the result before it becomes available'}</span><span>{elapsed}s elapsed</span></div></>}
    {!active && <p className="q-job-outcome" role="status">{job.error ?? (job.status === 'cancelled' ? 'Run cancelled. Your published universe and previous signals are unchanged.' : job.kind === 'tactical' ? `${job.scopeCount} cached candidates checked · ${job.signalCount ?? 0} signals found.` : `${resultSummary} ${job.kind === 'trial' ? 'Trial results do not replace the monthly universe.' : job.status === 'ready' ? 'Review the result before publishing the monthly universe.' : 'Monthly universe published.'}`)}</p>}
    {stale && <p className="q-job-version-note">The rules have changed since this run was queued. This scan uses the conditions saved when it started.</p>}
    <footer><span>{active ? 'You can keep working in this workspace. Previous completed results stay visible.' : `Job ${job.id.slice(0, 8)} · ${new Date(job.createdAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`}<small>SIMULATED PROGRESS · ACCELERATED FOR DESIGN REVIEW</small></span><div>{active && <Button size="small" onClick={onCancel}>Cancel scan</Button>}{trouble && <Button size="small" icon={<ReloadOutlined aria-hidden />} disabled={retryDisabled} onClick={onRetry}>Retry scan</Button>}{job.result && onReview && <Button size="small" type={job.status === 'ready' ? 'primary' : 'default'} onClick={onReview}>{job.kind === 'monthly' && job.status === 'ready' ? 'Review & publish' : 'View scan results'}</Button>}</div></footer>
  </section>;
}
