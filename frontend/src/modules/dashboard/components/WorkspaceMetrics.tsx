import { Link } from 'react-router-dom';
import { ArrowRightOutlined } from '@ant-design/icons';
import type { WorkspaceDashboard } from '../types/workspace';
import type { DashboardPreferences } from '../config/preferences';
const paperMoney = (value: number | null) => value === null ? 'Unavailable' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value / 100);
export function WorkspaceMetrics({ data, ids = ['qualified', 'monitoring', 'positions', 'pnl'] }: { data: WorkspaceDashboard; ids?: DashboardPreferences['metricIds'] }) {
  const p = data.paper;
  const metrics = [
    { title: 'Qualified stocks', value: data.qualification.count.toLocaleString(), note: `${data.month} · ${data.qualification.manualCount} manual additions`, to: '/qualification?tab=stocks' },
    { title: 'Strategies monitoring', value: String(p.sessions.length), note: `${data.strategyCount} saved · ${data.signalsToday} signals today`, to: '/signal-runner' },
    { title: 'Open paper positions', value: String(p.openPositions), note: `${p.pendingOrders} pending orders · ${p.confirmations} need confirmation`, to: '/paper-trading' },
    { title: 'Total paper P&L', value: paperMoney(p.totalPaise), note: `${p.accounts} paper accounts · all time`, to: '/paper-trading', tone: p.totalPaise === null || p.totalPaise === 0 ? '' : p.totalPaise > 0 ? 'positive' : 'negative' },
  ];
  const metricOrder = ['qualified', 'monitoring', 'positions', 'pnl'];
  const selected = ids.map(id => metrics[metricOrder.indexOf(id)]).filter(Boolean);
  return <><section className="workspace-metrics" data-count={selected.length} aria-label="Workspace summary">{selected.map(m => <Link key={m.title} to={m.to} className="workspace-metric"><span>{m.title}<ArrowRightOutlined /></span><strong className={m.tone}>{m.value}</strong><small>{m.note}</small></Link>)}</section>
    {ids.includes('pnl') && <div className="workspace-pnl-breakdown"><span>Realized <b className={p.realizedPaise < 0 ? 'negative' : 'positive'}>{paperMoney(p.realizedPaise)}</b></span><span>Unrealized <b className={(p.unrealizedPaise ?? 0) < 0 ? 'negative' : 'positive'}>{paperMoney(p.unrealizedPaise)}</b></span><span>{p.missingMarks ? `${p.missingMarks} positions lack prices; total P&L is unavailable.` : p.staleMarks ? `${p.staleMarks} positions use last received prices.` : 'Open positions use the latest received prices.'} Unrealized P&L excludes future exit costs.</span></div>}</>;
}
