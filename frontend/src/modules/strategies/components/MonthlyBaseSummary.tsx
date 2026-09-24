import { Button, Tag } from 'antd';
import { LockOutlined, CalendarOutlined, ArrowRightOutlined, DatabaseOutlined } from '@ant-design/icons';
import type { MonthlyBase } from '../types/workspace';
import { formatMonth, formatSavedDate, isRefreshDue, nextMonth } from '../utils/monthlyCycle';
import { QualificationRulesSummary } from './QualificationRulesSummary';

export function MonthlyBaseSummary({ base, currentMonth, onViewStocks, onPlan, onReview }: {
  base: MonthlyBase; currentMonth: string; onViewStocks: () => void; onPlan: () => void; onReview: () => void;
}) {
  const due = isRefreshDue(base.current.month, currentMonth);
  return <section className="monthly-base-summary">
    <div className="base-summary-header"><div><span className="workspace-eyebrow">LAYER 01 · MONTHLY BASE UNIVERSE</span><h2>{base.name}</h2><p>The outer filter. Every horizon qualifies its watchlist from these stocks.</p></div>
      <Tag icon={due ? <CalendarOutlined /> : <LockOutlined />} color={due ? 'gold' : 'blue'}>{due ? 'Monthly refresh due' : 'Monthly snapshot saved'}</Tag>
    </div>
    <div className="base-summary-metrics">
      <button className="universe-count" onClick={onViewStocks} aria-label={`View ${base.current.stocks.length} qualified stocks`}><DatabaseOutlined /><div><strong>{base.current.stocks.length}</strong><span>qualified stocks <ArrowRightOutlined /></span></div></button>
      <div><small>CURRENT CYCLE</small><strong>{formatMonth(base.current.month)}</strong><span>Snapshot v{base.current.version} · Saved {formatSavedDate(base.current.qualifiedAt)}</span></div>
      <div><small>NEXT BASE REVIEW</small><strong>{due ? 'Ready to refresh' : `01 ${formatMonth(nextMonth(base.current.month), true)}`}</strong><span>{base.plannedRules ? 'New base rules staged' : 'Current rules carry forward'}</span></div>
    </div>
    <QualificationRulesSummary rules={base.current.rules} />
    <div className="base-summary-footer"><span><LockOutlined /> Base rules and this stock list stay fixed for the current cycle.</span><div><Button size="small" onClick={onPlan}>{due ? 'Edit refresh rules' : 'Plan next-month rules'}</Button><Button size="small" type={due ? 'primary' : 'default'} onClick={onReview}>Monthly review</Button></div></div>
  </section>;
}
