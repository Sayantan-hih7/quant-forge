import { useEffect } from 'react';
import { Alert, App, Button, Empty, Skeleton, Tabs, Tag } from 'antd';
import { ArrowRightOutlined, CheckCircleOutlined, DisconnectOutlined, LoadingOutlined, RadarChartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQualification } from '../../qualification/hooks/useQualification';
import { usePaperTradingStore } from '../../paper-trading/store/paperTradingStore';
import { useDemoStore } from '../../../store/demoStore';
import { idleMonitor, useSignalMonitorStore } from '../store/signalMonitorStore';
import { watchedPositions } from '../api/mockMonitor';
import { clockLabel, definitionKey, monitorDefinitions, nextCandle } from '../utils/monitoring';
import { MonitorControls } from '../components/MonitorControls';
import { MonitorTiming } from '../components/MonitorTiming';
import { SignalActivity } from '../components/SignalActivity';
import { MonitoringCoverage } from '../components/MonitoringCoverage';
import '../../../styles/qualification.css';
import '../../../styles/signal-monitor.css';

export default function SignalRunnerPage() {
  const { owner, workspace: qualification, cache } = useQualification();
  const actions = useSignalMonitorStore();
  const workspace = actions.workspaces[owner];
  const initialize = actions.initialize;
  const sessions = usePaperTradingStore(state => state.sessions[owner]);
  const globallyPaused = useDemoStore(state => state.enginePaused);
  const navigate = useNavigate();
  const { message } = App.useApp();
  useEffect(() => { initialize(owner); }, [owner, initialize]);
  if (!qualification || !workspace) return <Skeleton active />;
  const definitions = monitorDefinitions(qualification);
  const selected = definitions.find(item => item.id === workspace.selectedId) ?? definitions.find(item => item.id === qualification.selectedTacticalId) ?? definitions[0];
  if (!selected) return <Empty description="Save a complete strategy with buy and sell rules to start monitoring."><Button type="primary" onClick={() => navigate('/strategies')}>Open rule builder</Button></Empty>;
  const monitor = workspace.monitors[selected.id];
  const active = !!monitor && monitor.state !== 'stopped';
  const warming = monitor?.state === 'warming';
  const ready = monitor?.state === 'monitoring' && workspace.feed === 'healthy';
  const positions = watchedPositions(monitor ?? idleMonitor(selected), sessions ?? []);
  const stale = !!monitor && definitionKey(monitor.definition) !== definitionKey(selected);
  const paperPaused = sessions?.some(session => session.entryRule.id === selected.id && session.paused);
  const paused = !!monitor?.entryPaused || globallyPaused || !!paperPaused || stale;
  const events = workspace.signals.filter(event => event.monitorId === selected.id).sort((a, b) => b.time - a.time || Number(b.side === 'SELL') - Number(a.side === 'SELL'));
  const manualCount = cache?.candidates.filter(stock => stock.qualificationSource === 'manual').length ?? 0;
  const outsideCount = positions.filter(position => !cache?.candidates.some(stock => stock.symbol === position.symbol)).length;
  const activeCount = Object.values(workspace.monitors).filter(item => item.state !== 'stopped').length;
  const canStart = !!(cache?.candidates.length || positions.length) && workspace.feed === 'healthy';
  const nextClose = nextCandle(workspace.clock, monitor?.definition.entry.cadence ?? selected.entry.cadence);
  const stateLabel = !active ? 'Ready to monitor' : workspace.feed === 'disconnected' ? 'Feed disconnected' : workspace.feed === 'delayed' ? 'Data delayed' : warming ? 'Loading sample history' : !nextClose ? 'Session complete' : 'Monitoring';
  const paperRoute = (session?: string) => navigate(session ? `/paper-trading?session=${session}` : `/paper-trading?strategy=${encodeURIComponent(selected.id)}`);
  return <div className="monitor-page page-enter"><div className="page-heading"><div><h1>Signal runner</h1><p>Choose one strategy with both buy and sell rules. Alerts tell you when its conditions match.</p></div><Button icon={<ArrowRightOutlined aria-hidden />} onClick={() => navigate('/strategies')}>Algo strategies</Button></div>
    <div className="monitor-status-strip" role="status"><div className={`monitor-state-icon ${active && workspace.feed !== 'healthy' ? 'warning' : ''}`}>{warming && workspace.feed === 'healthy' ? <LoadingOutlined spin /> : active && workspace.feed !== 'healthy' ? <DisconnectOutlined /> : <RadarChartOutlined />}</div><div><strong>{stateLabel}</strong><p>{!active ? 'Start a monitor to load sample history and wait for completed candles.' : workspace.feed !== 'healthy' ? 'Entry and exit checks are unavailable until the sample feed recovers.' : warming ? 'Preparing indicator history and checking data continuity…' : nextClose ? `Waiting for the next candle close at ${clockLabel(nextClose)} IST.` : 'No more entry candles in this demo session. Held-position checks remain visible.'}</p></div><div className="monitor-status-meta"><Tag color="purple">ALERTS ONLY · NO AUTOMATIC TRADES</Tag><span>{activeCount} active {activeCount === 1 ? 'monitor' : 'monitors'} · No broker connected</span></div></div>
    {workspace.interrupted && <Alert className="monitor-banner" showIcon type="info" title="Previous demo monitoring stopped when the session ended." description="Saved activity is retained. Start monitoring again; this browser preview does not run in the background after reload or sign-out." />}
    {stale && <Alert className="monitor-banner" showIcon type="warning" title="This monitor uses an earlier saved rule pair." description="Update the monitor to use your changes for new entries. Held positions keep their original exit rules." />}
    {(!cache?.candidates.length || paused) && <Alert className="monitor-banner" showIcon type="warning" title={!cache?.candidates.length ? 'No current monthly candidates for new entries.' : paperPaused ? 'A linked paper session has paused new entries.' : 'New entries are paused.'} description="Held-position exit checks continue while this monitor is running and the feed is healthy." action={paperPaused ? <Button size="small" onClick={() => paperRoute()}>Open paper trading</Button> : !cache?.candidates.length ? <Button size="small" onClick={() => navigate('/qualification')}>Qualification</Button> : undefined} />}
    {!!positions.length && (!active || workspace.feed !== 'healthy') && <Alert className="monitor-banner" showIcon type="error" title={`${positions.length} held positions have no active exit checks in this preview.`} description="Restore the feed and start monitoring. Manual position controls are available in Paper Trading; sample holdings are illustrative only." />}
    <div className="monitor-flow-note"><strong>Buy rules</strong> watch the monthly stock list. <strong>Sell rules</strong> watch held positions. Review alerts and confirm simulated trades in <Button type="link" size="small" onClick={() => paperRoute()}>Paper trading</Button>.</div>
    <MonitorControls definitions={definitions} selected={selected} monitor={monitor} workspace={workspace} heldCount={positions.length} canStart={canStart} stale={stale} canSample={!!selected.exit && !!cache?.candidates.length} onSelect={id => actions.select(owner, id)} onStart={() => { if (!actions.start(owner, selected.id)) message.warning('Publish a qualified list or retain a held position, and restore the sample feed first.'); }} onStop={() => { if (!actions.stop(owner, selected.id)) message.warning('Pause new entries while held positions still need exit monitoring.'); }} onPause={() => actions.pauseEntries(owner, selected.id, !monitor?.entryPaused)} onCheck={() => actions.checkLatest(owner, selected.id)} onFeed={feed => actions.setFeed(owner, feed)} onAdvance={() => actions.advanceCandle(owner, selected.id)} onSamples={() => actions.toggleSamples(owner, selected.id)} />
    <div className="monitor-stat-grid"><div><span>Monthly entry pool</span><strong>{cache?.candidates.length ?? 0}<small>stocks</small></strong><button onClick={() => navigate('/qualification')}>{cache?.month ?? 'Not published'} · {manualCount} custom additions <ArrowRightOutlined /></button></div><div><span>Held-position exits</span><strong>{positions.length}<small>{ready ? 'being checked' : 'awaiting monitoring'}</small></strong><small>{outsideCount} outside monthly list · original rules retained</small></div><div><span>Last evaluated candle</span><strong className="monitor-time-stat">{clockLabel(monitor?.lastCandle)}</strong><small>Checked {monitor?.checkedCount ?? 0} candidates · {clockLabel(monitor?.lastEvaluation)} IST</small></div><div><span>Signal activity</span><strong>{events.filter(event => event.disposition === 'ready').length}<small>ready</small></strong><small>{events.filter(event => event.disposition === 'blocked').length} blocked · {events.filter(event => event.disposition === 'expired').length} expired · 0 orders</small></div></div>
    <div className="monitor-content-grid"><section className="monitor-panel monitor-activity"><header className="monitor-panel-title"><div><h2>Monitor activity</h2><p>{selected.name} · synthetic prices and indicator values</p></div><div className={`monitor-feed-label ${workspace.feed === 'healthy' ? 'positive' : 'negative'}`}>{workspace.feed === 'healthy' ? <CheckCircleOutlined /> : <DisconnectOutlined />}<span>{workspace.feed === 'healthy' ? active ? 'Sample feed online' : 'Sample feed ready' : workspace.feed === 'delayed' ? 'Sample feed delayed' : 'Sample feed disconnected'}<small>Last update · {clockLabel(workspace.lastFeed)} IST</small></span></div></header>{workspace.lastNotice && <p className="monitor-inline-notice" role="status">{workspace.lastNotice}</p>}<Tabs items={[{ key: 'signals', label: `Signal activity (${events.length})`, children: <SignalActivity events={events} /> }, { key: 'coverage', label: 'Stock coverage', children: <MonitoringCoverage cache={cache} positions={positions} entriesPaused={paused} active={!!ready} feedReady={workspace.feed === 'healthy'} onPaper={paperRoute} /> }]} /></section><MonitorTiming definition={selected} monitor={monitor} clock={workspace.clock} onEdit={() => navigate(`/strategies?tab=rules&rule=${encodeURIComponent(selected.id)}`)} /></div>
    <p className="monitor-disclosure">UI simulation · The demo clock advances while monitors run in this app. “Advance demo candle” moves that clock explicitly. No exchange feed, holiday calendar, real order routing, or background trading service is connected.</p>
  </div>;
}
