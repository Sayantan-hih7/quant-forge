import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import { Alert, Button, Skeleton, Space, Tag } from 'antd';
import { ArrowRightOutlined, ReloadOutlined, SettingOutlined, StarOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import { useIndexQuotes } from '../../market-data/hooks/useIndexQuotes';
import { IndexHighlights } from '../../market-data/components/IndexHighlights';
import { WorkspaceMetrics } from '../components/WorkspaceMetrics';
import { BacktestsWidget, MonitoringWidget, QualificationWidget, SignalsWidget, WatchlistsWidget } from '../components/DashboardWidgets';
import { defaultDashboardPreferences } from '../config/preferences';
import { dashboardTime as time } from '../utils/format';
import type { WorkspaceDashboard } from '../types/workspace';
import '../../../styles/indices.css';
import '../../../styles/watchlists.css';
import '../../../styles/workspace-dashboard.css';

const fullWidth = new Set(['summary', 'market', 'watchlists']);
export default function DashboardPage() {
  const resource = useStockResource<WorkspaceDashboard>('/dashboard', 15000), data = resource.data, navigate = useNavigate();
  const preferences = data?.preferences ?? defaultDashboardPreferences;
  const visible = preferences.sections.filter(section => section.visible);
  const marketVisible = !!data && visible.some(section => section.id === 'market');
  const indices = useIndexQuotes(marketVisible);
  const benchmarks = preferences.indexIds.flatMap(id => { const quote = indices.quotes.find(q => q.id === id); return quote ? [quote] : []; });
  const widgets = data ? {
    summary: <WorkspaceMetrics data={data} ids={preferences.metricIds} />,
    market: <><div className="workspace-section-title"><h2>Market overview</h2><Link to="/market-data/indices">All indices <ArrowRightOutlined /></Link></div>
      <p className="workspace-caption">{!indices.autoUpdate ? 'Automatic index updates are paused. You can resume them on the Indices page.' : indices.market && !indices.market.open ? `${indices.market.reason} · saved exchange snapshots. Updates resume at the next regular session.` : 'Exchange snapshots update during regular market hours.'}</p>
      {indices.error && <p className="negative">Index updates unavailable: {indices.error}</p>}
      <IndexHighlights quotes={benchmarks} showSparklines={preferences.showSparklines} onSelect={quote => navigate(`/market-data/indices?index=${encodeURIComponent(quote.id)}`)} /></>,
    monitoring: <MonitoringWidget key={preferences.monitoringPageSize} data={data} pageSize={preferences.monitoringPageSize} />,
    qualification: <QualificationWidget data={data} />,
    signals: <SignalsWidget data={data} side={preferences.signalSide} />,
    backtests: <BacktestsWidget data={data} />,
    watchlists: <WatchlistsWidget data={data} />,
  } : null;
  return <div className={`workspace-dashboard is-${preferences.density}`}>
    <div className="workspace-page-heading"><div><span className="indices-eyebrow">YOUR TRADING WORKSPACE</span><h1>Dashboard <Tag color="blue">Paper trading</Tag></h1><p>{data ? `${data.market.date} · ${data.market.reason} · Updated ${time(data.at)}` : 'Loading your workspace…'}</p></div><Space wrap>
      <Button icon={<SettingOutlined aria-hidden />} onClick={() => navigate('/settings?tab=dashboard')}>Customize</Button>
      <Button icon={<ReloadOutlined aria-hidden />} onClick={() => { resource.retry(); if (marketVisible) void indices.refresh(); }} loading={resource.loading}>Refresh</Button>
      <Button type="primary" onClick={() => navigate('/market-data/watchlists?tab=watchlist')} icon={<StarOutlined />}>My watchlist</Button>
    </Space></div>
    {resource.error && <RequestFeedback type="warning" showIcon title="Workspace could not be refreshed" description={resource.error} action={<Button onClick={resource.retry}>Retry</Button>} />}
    {!data || !widgets ? <Skeleton active paragraph={{ rows: 8 }} /> : <>
      {data.paper.sessions.length > 0 && (!data.paper.workerRunning || data.market.open && data.paper.feed !== 'live') && <Alert className="workspace-alert" type="warning" showIcon title={!data.paper.workerRunning ? 'The paper worker is offline' : 'Live feed needs attention'} description={data.paper.workerRunning ? data.paper.feedMessage : 'Monitoring and paper fills need the paper worker running.'} action={<Link to="/data-sources">Check connections</Link>} />}
      {data.paper.confirmations > 0 && <Alert className="workspace-alert" type="info" showIcon title={`${data.paper.confirmations} paper orders await your confirmation`} action={<Link to="/paper-trading">Review orders</Link>} />}
      <div className="dashboard-widget-grid">{visible.map((section, index) => {
        let preceding = 0;
        for (let i = index - 1; i >= 0 && !fullWidth.has(visible[i].id); i--) preceding++;
        const lastInRun = index === visible.length - 1 || fullWidth.has(visible[index + 1].id);
        const wide = fullWidth.has(section.id) || (lastInRun && preceding % 2 === 0);
        return <div key={section.id} data-dashboard-section={section.id} className={wide ? 'dashboard-widget-wide' : undefined}>{widgets[section.id]}</div>;
      })}</div>
    </>}
  </div>;
}
