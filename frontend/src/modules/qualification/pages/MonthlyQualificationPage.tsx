import '../../../styles/qualification.css';
import '../../../styles/monthly-qualification.css';
import { useState } from 'react';
import { App, Skeleton, Tabs, Tag } from 'antd';
import { DatabaseOutlined, SlidersOutlined } from '@ant-design/icons';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQualification } from '../hooks/useQualification';
import { formatMonth, previousMonth } from '../../strategies/utils/monthlyCycle';
import { MonthlyRuleBuilder } from '../components/MonthlyRuleBuilder';
import { MonthlyUniverse } from '../components/MonthlyUniverse';
import { MonthlyScanActivity } from '../components/MonthlyScanActivity';
import { useQualificationStore } from '../store/qualificationStore';
import { canRunSavedMonthlyRule } from '../utils/monthlyRuleChanges';
import { isScanActive } from '../utils/scanJobs';

export default function MonthlyQualificationPage() {
  const { owner, workspace, month } = useQualification();
  const [params, setParams] = useSearchParams();
  const [dirty, setDirty] = useState(false);
  const queue = useQualificationStore((state) => state.queueBaseScan);
  const { message } = App.useApp();
  if (!workspace) return <Skeleton active />;
  if (params.get('tab') === 'runner') return <Navigate to="/signal-runner" replace />;
  const tab = params.get('tab') === 'rules' ? 'rules' : 'universe';
  const onPublished = () => setParams({ tab: 'universe' });
  const onQueued = () => setParams({ tab: 'universe' });
  const canRun = !dirty && canRunSavedMonthlyRule(workspace, month);
  const running = workspace.jobs.some((job) => job.kind === 'monthly' && job.month === month && isScanActive(job));
  const activity = <MonthlyScanActivity owner={owner} workspace={workspace} month={month} dirty={dirty} onPublished={onPublished} />;
  const onRun = () => { if (canRun && queue(owner)) { message.info('Saved monthly rule queued for scanning.'); onQueued(); } };
  return <div className="qualification-page page-enter">
    <div className="page-heading"><div><h1>Stock qualification</h1><p>Build and maintain your monthly stock universe.</p></div><div className="q-page-meta"><Tag>MOCK WORKSPACE</Tag><span>{formatMonth(month)} · IST</span></div></div>
    <div className="monthly-workspace-context"><div><span className="q-eyebrow">MONTHLY QUALIFICATION</span><strong>Monthly rules · 6,200 stocks</strong></div><div><span className="q-eyebrow">AVAILABLE DATA</span><strong>Through {formatMonth(previousMonth(month))}</strong></div><Tag color="blue">Completed monthly candles</Tag></div>
    <div className="q-workspace"><Tabs activeKey={tab} onChange={(next) => setParams({ tab: next })} items={[
      { key: 'rules', label: <><SlidersOutlined aria-hidden />Monthly rules</>, children: <MonthlyRuleBuilder workspace={workspace} owner={owner} month={month} onQueued={onQueued} onDirtyChange={setDirty} activity={tab === 'rules' ? activity : null} /> },
      { key: 'universe', label: <><DatabaseOutlined aria-hidden />Qualified stocks <span className="q-tab-count">{workspace.caches[month]?.candidates.length ?? 0}</span></>, children: <MonthlyUniverse key={month} workspace={workspace} owner={owner} month={month} onRules={() => setParams({ tab: 'rules' })} onRun={onRun} canRun={canRun} running={running} activity={tab === 'universe' ? activity : null} /> },
    ]} /></div>
    <p className="q-demo-note">UI preview · Monthly prices, memberships and filter data are simulated. Scans use accelerated progress for design review.</p>
  </div>;
}
