import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Popconfirm, Select, Switch, Table, Tabs, Tag } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { ExperimentOutlined, PlusOutlined, RadarChartOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../../store/authStore';
import { useDemoStore } from '../../../store/demoStore';
import { paperEquity, paperQuote, refreshPaperScope, usePaperTradingStore } from '../store/paperTradingStore';
import { money, signedMoney, tradeTime } from '../../backtesting/config/backtestDefaults';
import { ManualBuyModal } from '../components/ManualBuyModal';
import { RulePairSummary } from '../../backtesting/components/RulePairSummary';
import type { PaperEvent, PaperPosition } from '../types';
import { PaperSignalInbox } from '../components/PaperSignalInbox';
import { useSignalMonitorStore } from '../../signals/store/signalMonitorStore';
import { useQualification } from '../../qualification/hooks/useQualification';
import '../../../styles/backtesting.css';

export default function PaperTradingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const owner = useAuthStore((state) => state.session?.email ?? 'demo');
  const enginePaused = useDemoStore((state) => state.enginePaused);
  const actions = usePaperTradingStore();
  const sessions = actions.sessions[owner] ?? [];
  const [params, setParams] = useSearchParams();
  const savedSession = sessions.find((item) => item.id === params.get('session')) ?? (params.get("strategy") ? sessions.find(item => item.entryRule.id === params.get("strategy")) : sessions[0]);
  const { cache, workspace } = useQualification();
  const session = savedSession ? refreshPaperScope(owner, savedSession) : undefined;
  const currentPlan = workspace?.tradingPlans?.find(item => item.entryRuleId === session?.entryRule.id);
  const currentRules = workspace?.templates.filter(rule => rule.id === currentPlan?.entryRuleId || rule.id === currentPlan?.exitRuleId) ?? [];
  const differs = !!session && (!currentPlan || currentPlan.needsReview || !currentRules.some(rule => rule.id === session.entryRule.id && rule.revision === session.entryRule.revision) || !currentRules.some(rule => rule.id === session.exitRule.id && rule.revision === session.exitRule.revision));
  const [buying, setBuying] = useState(false);
  const { message } = App.useApp();
  return <div className="bt-page page-enter"><div className="page-heading"><div><span className="bt-eyebrow">STRATEGY LAB / PAPER TRADING</span><h1>Paper trading</h1><p>Review strategy alerts and record paper trades. Manual buy and sell remain available.</p></div><Link to={`/strategies?tab=backtests${params.get("strategy") ? `&strategy=${encodeURIComponent(params.get("strategy")!)}` : ""}`}><Button icon={<ExperimentOutlined aria-hidden />}>Backtests</Button></Link></div>
    {!session ? <section className="bt-panel bt-empty-results"><Empty description="Create a paper session from a completed backtest." /><Link to={`/strategies?tab=backtests${params.get("strategy") ? `&strategy=${encodeURIComponent(params.get("strategy")!)}` : ""}`}><Button type="primary">Open backtests</Button></Link><p className="bt-help">Your tested entry, exit, and risk settings carry forward. Paper trading starts with fresh capital.</p></section> : <>
      <div className="bt-panel paper-session-toolbar"><Select aria-label="Paper session" value={session.id} onChange={(id) => { setBuying(false); setParams({ session: id }); }} options={sessions.map((item) => ({ value: item.id, label: `${item.name} · ${item.id.slice(0, 6)}` }))} /><div><Tag color="purple">PAPER ONLY</Tag><Link to={`/strategies?tab=backtests&run=${session.runId}`}>View source backtest →</Link></div></div>
      <Alert className="bt-banner" type="info" showIcon title="Manual overrides stay separate from the tested strategy" description="Manual buys obey risk and cash limits. Manual sells close the position immediately at a simulated fill and pause new algo entries, preventing an immediate automatic re-entry. Resume explicitly when ready." />
      {differs && <Alert className="bt-banner" showIcon type="warning" title="This session has different saved rules from the current strategy." description="Held positions keep their original sell rules. Backtest the current strategy and create a new session to confirm its buy alerts; manual trading remains available here." />}
      {enginePaused && <Alert className="bt-banner" type="warning" title="Engine paused · New buys disabled. Sell exits remain available." />}
      <div className="bt-panel"><div className="bt-stat-grid paper-stats">{[
        ['Equity', money(paperEquity(session))], ['Available cash', money(session.cash)], ['Realized P&L', signedMoney(session.realized)], ['Open positions', `${session.positions.length} / ${session.config.maxPositions}`],
      ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="paper-controls"><label><Switch checked={!session.paused} onChange={(enabled) => actions.setPaused(owner, session.id, !enabled)} aria-label="Allow new algo entries" /><span>{session.paused ? 'New algo entries paused' : 'New algo entries allowed'}</span></label><div className="bt-actions"><Link to="/signal-runner"><Button icon={<RadarChartOutlined aria-hidden />} onClick={() => { const monitor = useSignalMonitorStore.getState(); monitor.initialize(owner); monitor.select(owner, session.entryRule.id); }}>Open signal runner</Button></Link><Button type="primary" icon={<PlusOutlined aria-hidden />} disabled={enginePaused || session.positions.length >= session.config.maxPositions} onClick={() => setBuying(true)}>Manual buy</Button><Popconfirm title="Sell all paper positions and pause entries?" description="Every open position in this session will close at its simulated price. The backtest report stays unchanged." onConfirm={() => actions.sellAll(owner, session.id)} okText="Sell all & pause"><Button danger disabled={!session.positions.length}>Sell all & pause</Button></Popconfirm></div></div>
        <Tabs activeKey={params.get("view") ?? "positions"} onChange={view => setParams({ session: session.id, view })} items={[
          { key: 'signals', label: 'Strategy alerts', children: <PaperSignalInbox owner={owner} session={session} /> },
          { key: 'positions', label: `Open positions (${session.positions.length})`, children: <Table<PaperPosition> className="paper-positions" size="small" rowKey="id" dataSource={session.positions} scroll={{ x: 950 }} pagination={false} locale={{ emptyText: 'No open positions. Review a strategy alert or place a manual paper buy.' }} columns={[
            { title: 'Stock / source', key: 'stock', render: (_, position) => <div className="bt-table-stock"><strong>{position.symbol}</strong><small>{position.source} entry</small></div> },
            { title: 'Qty', dataIndex: 'quantity' }, { title: 'Buy fill', dataIndex: 'entry', render: money }, { title: 'Simulated LTP', key: 'ltp', render: (_, position) => money(paperQuote(session, position.symbol)) },
            { title: 'Stop / target', key: 'protection', render: (_, position) => <div className="bt-table-stock"><span className="negative">{money(position.stop)}</span><small>{money(position.target)} target</small></div> },
            { title: 'Unrealized P&L', key: 'pnl', render: (_, position) => { const pnl = (paperQuote(session, position.symbol) - position.entry) * position.quantity - position.entryFee; return <span className={pnl >= 0 ? 'positive' : 'negative'}>{signedMoney(pnl)}</span>; } },
            { title: 'Override', key: 'action', render: (_, position) => <Button danger size="small" onClick={() => { actions.sellManual(owner, session.id, position.id); message.success(`${position.symbol} sold in paper trading. New algo entries paused.`); }} aria-label={`Sell ${position.symbol} now`}>Sell now</Button> },
          ]} /> },
          { key: 'activity', label: `Activity (${session.events.length})`, children: <Table<PaperEvent> size="small" rowKey="id" dataSource={session.events} scroll={{ x: 950 }} pagination={{ pageSize: 10, showSizeChanger: false }} columns={[
            { title: 'Time · IST', dataIndex: 'time', render: tradeTime }, { title: 'Stock', dataIndex: 'symbol' }, { title: 'Action', dataIndex: 'side', render: (side: string) => <Tag color={side === 'BUY' ? 'green' : 'red'}>{side}</Tag> }, { title: 'Source', dataIndex: 'source' }, { title: 'Qty', dataIndex: 'quantity' }, { title: 'Fill', dataIndex: 'price', render: money }, { title: 'Net realized P&L', dataIndex: 'pnl', render: (value?: number) => value === undefined ? '—' : signedMoney(value) }, { title: 'Reason', dataIndex: 'reason' },
          ]} /> },
          { key: 'rules', label: 'Session rules', children: <div className="bt-assumptions"><RulePairSummary entry={session.entryRule} exit={session.exitRule} /><p>Rules are pinned to the source backtest. New buys use the current monthly list: {cache?.candidates.length ?? 0} candidates. Existing holdings keep their saved sell rules even if they leave that list.</p><p>Fresh starting capital: {money(session.config.initialCapital)}. Risk {session.config.riskPercent}% per trade · {session.config.stopMode} stop · {session.config.targetR}R target.</p></div> },
        ]} />
      </div><p className="bt-disclosure">Paper simulation · Strategy alerts come from Signal Runner and need your confirmation before a paper fill. Manual sells pause new strategy entries. No live broker orders are submitted.</p>
      {buying && <ManualBuyModal key={session.id} owner={owner} session={session} onClose={() => setBuying(false)} />}
    </>}
  </div>;
}
