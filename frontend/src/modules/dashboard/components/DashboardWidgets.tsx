import { Button, Empty, Table, Tag } from 'antd';
import { ArrowRightOutlined, StarOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import type { WorkspaceDashboard } from '../types/workspace';
import type { DashboardPreferences } from '../config/preferences';
import { dashboardTime as time } from '../utils/format';

export function MonitoringWidget({ data, pageSize }: { data: WorkspaceDashboard; pageSize: number }) {
  const navigate = useNavigate();
  return <section className="workspace-panel"><div className="workspace-panel-title"><h2>Strategy monitoring</h2><Link to="/signal-runner">Signal Runner <ArrowRightOutlined /></Link></div>
    <Table size="small" rowKey="id" dataSource={data.paper.sessions} pagination={data.paper.sessions.length > pageSize ? { pageSize, showSizeChanger: false, showTotal: total => `${total} monitoring strategies` } : false} scroll={{ x: 560 }} locale={{ emptyText: <Empty description="No strategies are monitoring yet"><Button onClick={() => navigate('/strategies')}>Choose a strategy & backtest</Button></Empty> }} columns={[
      { title: 'Strategy', render: (_, row) => <><Link to={`/signal-runner?session=${row.id}`}>{row.name}</Link><div className="muted">Revision {row.revision}{row.currentRevision !== row.revision && <Tag color="orange">{row.currentRevision ? `Saved r${row.currentRevision}` : 'Strategy removed'}</Tag>}</div></> },
      { title: 'Mode', render: (_, row) => <><Tag color={row.mode === 'signals' ? 'default' : 'blue'}>{row.mode === 'automatic' ? 'Auto paper' : row.mode === 'confirmation' ? 'Confirm orders' : 'Signals only'}</Tag>{row.paused && <div className="muted">New entries paused</div>}</> },
      { title: 'Stocks', dataIndex: 'stocks', align: 'right' },
      { title: 'Last evaluated', render: (_, row) => <span className="muted" title={row.message ?? undefined}>{time(row.checkedAt)}</span> },
    ]} />
  </section>;
}
export function QualificationWidget({ data }: { data: WorkspaceDashboard }) {
  const navigate = useNavigate();
  return <section className="workspace-panel"><div className="workspace-panel-title"><h2>Monthly qualification</h2><Link to="/qualification">Open <ArrowRightOutlined /></Link></div><div className="workspace-qualification"><strong>{data.qualification.count}<span>published stocks</span></strong><p>{data.qualification.publishedAt ? `Published ${time(data.qualification.publishedAt)}` : 'No list published for this month.'}</p>
    {data.qualification.latestScan && <div className="workspace-scan"><Tag color={data.qualification.latestScan.status === 'completed' ? 'green' : 'default'}>{data.qualification.latestScan.status}</Tag><p>{data.qualification.latestScan.processed.toLocaleString()} / {data.qualification.latestScan.total.toLocaleString()} evaluated · {data.qualification.latestScan.qualified} passed</p>{data.qualification.latestScan.unavailable > 0 && <p className="warning">{data.qualification.latestScan.unavailable} stocks have data gaps.</p>}</div>}
    <p className="muted">{data.stockCount.toLocaleString()} active listings in the stock universe. A new scan replaces the published list only after you publish it.</p><Button onClick={() => navigate('/qualification?tab=rules')}>Review monthly rules</Button></div>
  </section>;
}
export function SignalsWidget({ data, side }: { data: WorkspaceDashboard; side: DashboardPreferences['signalSide'] }) {
  return <section className="workspace-panel"><div className="workspace-panel-title"><h2>Recent signals</h2><span className="muted">{side === 'all' ? 'Buy and sell events' : side === 'BUY' ? 'Buy events only' : 'Sell events only'}</span></div>{data.signals.length ? <div className="workspace-activity">{data.signals.map(s => <Link key={s.id} to={`/signal-runner?session=${s.sessionId}`}><Tag color={s.side === 'BUY' ? 'green' : 'red'}>{s.side}</Tag><div><strong>{s.symbol}</strong><span>{s.strategy} · {time(s.at)}</span></div><Tag>{s.status}</Tag></Link>)}</div> : <Empty description={side === 'all' ? 'Signals appear when a monitored strategy matches a completed candle.' : `No recent ${side.toLowerCase()} signals.`} />}</section>;
}
export function BacktestsWidget({ data }: { data: WorkspaceDashboard }) {
  return <section className="workspace-panel"><div className="workspace-panel-title"><h2>Recent backtests</h2><Link to="/strategies">Strategies <ArrowRightOutlined /></Link></div>{data.backtests.length ? <div className="workspace-backtests">{data.backtests.map(b => <Link key={b.id} to={`/strategies?rule=${b.strategyId}&tab=backtests&run=${b.id}`}><div><strong>{b.name} <small>r{b.revision}</small></strong><span>{b.from.slice(0, 10)} — {b.to.slice(0, 10)}</span></div><div><Tag color={b.status === 'completed' ? 'green' : b.status === 'failed' ? 'red' : 'blue'}>{b.status}</Tag>{b.currentRevision !== b.revision && <Tag color="orange">{b.currentRevision ? `Older rules · saved r${b.currentRevision}` : 'Strategy removed'}</Tag>}</div></Link>)}</div> : <Empty description="Backtest a saved strategy before monitoring it." />}</section>;
}
export function WatchlistsWidget({ data, preferences }: { data: WorkspaceDashboard; preferences: DashboardPreferences }) {
  const missing = preferences.watchlistMode === 'selected' && data.watchlists.length < preferences.watchlistIds.length;
  return <section className="workspace-panel workspace-watchlists"><div className="workspace-panel-title"><h2>Your watchlists</h2><Link to="/market-data/watchlists">Browse all stocks <ArrowRightOutlined /></Link></div>{data.watchlists.length ? <div className="workspace-watchlist-links">{data.watchlists.map(w => <Link to={`/market-data/watchlists?list=${w.id}`} key={w.id}><StarOutlined /><strong>{w.name}</strong><span>{w.count} stocks</span><ArrowRightOutlined /></Link>)}</div> : <p className="muted">{preferences.watchlistMode === 'selected' ? 'Your selected watchlists are no longer available.' : 'Follow any stock without adding it to your qualified list.'} <Link to={preferences.watchlistMode === 'selected' ? '/settings?tab=dashboard' : '/market-data/watchlists'}>{preferences.watchlistMode === 'selected' ? 'Choose watchlists' : 'Create your first watchlist'}</Link>.</p>}{missing && data.watchlists.length > 0 && <p className="muted">A pinned watchlist was removed. <Link to="/settings?tab=dashboard">Update your selection</Link>.</p>}</section>;
}
