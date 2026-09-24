import { Alert, App, Button, Drawer, Empty, Tag } from 'antd';
import { LockOutlined, HistoryOutlined } from '@ant-design/icons';
import type { MonthlyBase, UniverseSnapshot } from '../types/workspace';
import { qualifyMockUniverse } from '../api/mockUniverse';
import { formatMonth, formatSavedDate, isRefreshDue, nextMonth } from '../utils/monthlyCycle';
import { QualificationRulesSummary } from './QualificationRulesSummary';

export function MonthlyReviewDrawer({ base, currentMonth, onClose, onRefresh, onViewSnapshot }: {
  base: MonthlyBase; currentMonth: string; onClose: () => void; onRefresh: () => boolean; onViewSnapshot: (snapshot: UniverseSnapshot) => void;
}) {
  const { message } = App.useApp();
  const due = isRefreshDue(base.current.month, currentMonth);
  const targetMonth = due ? currentMonth : nextMonth(base.current.month);
  const rules = base.plannedRules ?? base.current.rules;
  const preview = qualifyMockUniverse(rules, targetMonth);
  const before = new Set(base.current.stocks.map((stock) => stock.symbol));
  const after = new Set(preview.map((stock) => stock.symbol));
  const added = preview.filter((stock) => !before.has(stock.symbol)).length;
  const removed = base.current.stocks.filter((stock) => !after.has(stock.symbol)).length;
  return <Drawer title="Monthly base review" open size={570} onClose={onClose}
    footer={<div className="review-footer"><span>{due ? 'A new snapshot will replace the current coverage.' : `Available from 01 ${formatMonth(targetMonth, true)} IST`}</span><Button type="primary" disabled={!due} onClick={() => { if (onRefresh()) { message.success('Monthly snapshot saved. Trading layers now use the new universe.'); onClose(); } else message.info('This month’s snapshot is already saved.'); }}>Refresh monthly universe</Button></div>}>
    <div className="onboarding-section-heading"><h2>{base.name}</h2><p>Preview the next universe and keep the previous monthly snapshot for reference.</p></div>
    <Alert showIcon icon={!due ? <LockOutlined /> : undefined} type={due ? 'warning' : 'info'} title={due ? `${formatMonth(currentMonth)} refresh is ready` : `${formatMonth(base.current.month)} is already qualified`} description={due ? 'Trading rules carry forward. Watchlists and signals are cleared; requalify each watchlist against the new universe before checking signals.' : 'The current base cannot be requalified during the same month. This preview does not change saved stocks, watchlists or signals.'} />
    <section className="monthly-review-section"><div className="review-section-title"><h3>{formatMonth(targetMonth)} preview</h3><Tag color={base.plannedRules ? 'purple' : 'default'}>{base.plannedRules ? 'Planned rule changes' : 'Same base rules'}</Tag></div><QualificationRulesSummary rules={rules} />
      <div className="refresh-comparison"><div><small>Current</small><strong>{base.current.stocks.length}</strong></div><span>→</span><div><small>Next universe</small><strong>{preview.length}</strong></div><div><small>Added</small><strong className="positive">+{added}</strong></div><div><small>Removed</small><strong className="negative">−{removed}</strong></div></div>
      {!preview.length && <Alert type="warning" showIcon title="These rules qualify no stocks." description="Saving this monthly snapshot will leave trading layers with no stock coverage. You can adjust planned rules before refreshing." />}
      <p className="muted">Illustrative results from monthly demo data. {base.layers.length} attached trading layers will be retained.</p>
    </section>
    <section className="monthly-review-section"><h3><HistoryOutlined /> Saved snapshots</h3>{[base.current, ...base.history.toReversed()].map((snapshot) => <div className="saved-snapshot" key={snapshot.id}><div><strong>{formatMonth(snapshot.month)} <small>v{snapshot.version}</small></strong><p>{snapshot.stocks.length} stocks · Saved {formatSavedDate(snapshot.qualifiedAt)}</p></div><Button size="small" onClick={() => onViewSnapshot(snapshot)}>View stocks</Button></div>)}{!base.history.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Previous months will appear after your first monthly refresh." />}</section>
  </Drawer>;
}
