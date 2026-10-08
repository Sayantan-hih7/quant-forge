import {BacktestPaperEligibility} from './BacktestPaperEligibility';
import { BacktestSelectionAudit } from './BacktestSelectionAudit';
import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import { fieldLabel } from '../../qualification/config/ruleFields';
import { useMemo, useState } from 'react';
import { StockChartButton } from '../../stock-details/components/StockChartButton';
import { BacktestStockChart } from './BacktestStockChart';
import { BacktestStockResults } from './BacktestStockResults';
import { backtestStockResults } from '../utils/stockResults';
import { ReportPnl } from './ReportPnl';
import '../../../styles/backtest-report.css';
import { Alert, Button, Card, Collapse, Col, Descriptions, Empty, Select, Row, Space, Statistic, Table, Tabs, Tag } from 'antd';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ProfitTargetSummary } from '../../strategies/components/ProfitTargetSummary';
import { StopManagementSummary } from '../../strategies/components/StopManagementSummary';
import type { BackendBacktest } from '../types/backend';
const researchMoney = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const time = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
export function BackendBacktestReport({ run }: { run: BackendBacktest }) {
  const result = run.result;
  const [chartStock, setChartStock] = useState<string>();
  const [tab, setTab] = useState('summary');
  const inspectStock = (id: string) => { setChartStock(id); setTab('chart'); };
  const stocks = useMemo(() => backtestStockResults(run), [run]);
  const selectedStock = stocks.find(stock => stock.instrumentId === chartStock) ?? stocks[0];
  const closedTrades = stocks.reduce((sum, stock) => sum + stock.closedTrades, 0);
  const wins = stocks.reduce((sum, stock) => sum + stock.wins, 0);
  if (!result) return null;
  const incomplete=!!(run.config.dataPolicy&&!run.selectionAudit)||!!(result.historyQuality?.missingMinutes||result.historyQuality?.missingExitSessions||Math.max(0,result.unavailableDecisions-(result.warmupDecisions??0))||result.unreadyInstruments?.length);
  const symbol = (id: string) => run.symbols?.[id] ?? id;
  return <Card className="backend-backtest-report" title={<Space wrap>{run.strategy.name}<Tag color={incomplete?"gold":"green"}>{incomplete?"Completed - data incomplete":"Completed"}</Tag></Space>} extra={<Button disabled={incomplete} title={incomplete?"Resolve the data gaps and rerun before using this report for paper trading":undefined} onClick={() => setTab('eligibility')}>Use for paper trading</Button>}>
    <p className="muted">{date(run.config.from)} – {date(new Date(Date.parse(run.config.to) - 1).toISOString())} · {run.config.ids.length} stocks · Saved strategy revision {run.strategy.revision}</p><StrategyHistoryButton strategy={run.strategy} context="This backtest report" />
    <Alert className="bt-data-status" showIcon type={incomplete || !!run.selectionAudit?.excluded.length || run.config.universe === 'current' ? 'warning' : 'info'}
      title={incomplete ? 'Data incomplete - research only. Paper-trading handoff unavailable.' : run.selectionAudit?.policy === 'ready' && run.selectionAudit.excluded.length ? `${run.selectionAudit.excluded.length} stocks excluded before replay - results cover ${run.config.ids.length} tested stocks. Review selection limitations.` : run.config.universe === 'current' ? "Research using today's stock list - historical selection bias applies." : 'Historical simulation - review data and execution assumptions.'}
      action={<Button size="small" onClick={() => setTab('data')}>View details</Button>}/>
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'summary', label: 'Summary', children: <>
    <Row className="bt-report-summary" gutter={[16, 24]}>{[
      ['Ending equity', researchMoney(result.equity)], ['Net P&L', researchMoney(result.netPnl)], ['Return', `${(result.returnPercent ?? result.netPnl / result.initialCapital * 100).toFixed(2)}%`],
      ['Max drawdown', `${result.maxDrawdownPercent.toFixed(2)}%`], ['Closed trades', closedTrades], ['Win rate', closedTrades ? `${(wins / closedTrades * 100).toFixed(1)}%` : '—'],
    ].map(([title, value]) => <Col xs={12} xl={4} key={title}><Statistic title={title} value={value} /></Col>)}</Row>

    <div style={{ height: 300, width: '100%', marginTop: 24 }} aria-label="Backtest equity curve"><ResponsiveContainer><AreaChart data={result.curve}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2}/><XAxis dataKey="at" tickFormatter={date} minTickGap={60}/><YAxis width={90} domain={['auto', 'auto']} tickFormatter={value => researchMoney(Number(value))}/>
      <Tooltip labelFormatter={value => time(String(value))} formatter={value => [researchMoney(Number(value)), 'Equity']}/><ReferenceLine y={result.initialCapital} stroke="#94a3b8" strokeDasharray="4 4"/>
      <Area type="linear" dataKey="equity" stroke={result.netPnl >= 0 ? '#059669' : '#e5484d'} fill={result.netPnl >= 0 ? '#059669' : '#e5484d'} fillOpacity={0.1} dot={false} isAnimationActive={false}/>
    </AreaChart></ResponsiveContainer></div>
    <Descriptions size="small" items={[
      { key: 'capital', label: 'Starting capital', children: researchMoney(result.initialCapital) },
      { key: 'realized', label: 'Realized P&L', children: researchMoney(result.realizedPnl ?? 0) },
      { key: 'fees', label: 'Estimated fees', children: researchMoney(result.totalFees ?? 0) },
      {key:'costModel',label:'Cost model',children:run.strategy.risk.costModel==='indian-cash'?'Indian cash (current-rate estimate)':'Flat fee percentage'},
      { key: 'pf', label: 'Profit factor', children: result.profitFactor == null ? '—' : result.profitFactor.toFixed(2) },
      { key: 'open', label: 'Still holding', children: `${result.openPositions.length} positions` },
      { key: 'missing', label: 'Unavailable rule checks', children: result.unavailableDecisions },
    ]}/>
    {result.metrics && <Collapse ghost items={[{key:'statistics',label:'More statistics & monthly returns',children:<>    {result.metrics&&<Card size="small" title="Return and risk statistics" className="mb-5"><Descriptions size="small" items={[{key:"cagr",label:"CAGR (at least 1 year)",children:result.metrics.cagrPercent==null?"Not available":`${result.metrics.cagrPercent.toFixed(2)}%`},{key:"sharpe",label:"Sharpe",children:result.metrics.sharpe?.toFixed(2)??"Not available"},{key:"sortino",label:"Sortino",children:result.metrics.sortino?.toFixed(2)??"Not available"},{key:"expectancy",label:"Net expectancy / closed position",children:result.metrics.expectancy==null?"Not available":`INR ${result.metrics.expectancy.toFixed(2)}`}]} /><p className="muted">{result.metrics.method}</p><Table size="small" rowKey="month" pagination={{pageSize:12}} dataSource={result.metrics.monthlyReturns} columns={[{title:"Month",dataIndex:"month"},{title:"Net return",render:(_,r)=>r.returnPercent==null?"Unavailable":`${r.returnPercent.toFixed(2)}%`}]}/></Card>}
</>}]} />}
      </> },
      { key: 'stocks', label: `Stocks (${stocks.length})`, children: <><BacktestStockResults stocks={stocks} onSelect={inspectStock}/><Collapse ghost items={[{key:'open',label:`Open positions (${result.openPositions.length})`,children:<Table size="small" rowKey="instrumentId" dataSource={result.openPositions} pagination={false} scroll={{ x: 600 }} columns={[
        { title: 'Stock', dataIndex: 'instrumentId', render: id => <StockChartButton symbol={symbol(id)} onClick={() => inspectStock(id)}/> }, { title: 'Shares', dataIndex: 'quantity' }, { title: 'Entry', dataIndex: 'entry', render: value => researchMoney(value / 100) },
        { title: 'Initial risk (1R)', dataIndex: 'initialRiskPaise', render: value => value ? researchMoney(value / 100) : '—' },
        { title: 'Stop', render: (_, row) => <Space>{researchMoney(row.stop)}{row.trailingActivated && <Tag color="purple">Trailing</Tag>}{row.breakevenActivated && <Tag color="blue">At entry or higher</Tag>}</Space> }, { title: 'Next target', dataIndex: 'target', render: researchMoney },
        { title: 'Final close', dataIndex: 'mark', render: researchMoney }, { title: 'Unrealized P&L', render: (_, row) => <ReportPnl value={row.mark * row.quantity - row.cost / 100}/> },
      ]}/>}]} /></> },
      { key: 'chart', label: 'Trades & chart', children: <>
        <div className="bt-inspection-nav"><Button onClick={() => setTab('stocks')}>Back to stock results</Button>
          <Select aria-label="Stock to inspect" showSearch optionFilterProp="label" value={selectedStock?.instrumentId} onChange={setChartStock} options={stocks.map(stock => ({value:stock.instrumentId,label:stock.symbol}))} style={{width:240,maxWidth:'100%'}}/>
        </div>
        {selectedStock ? <BacktestStockChart embedded key={selectedStock.instrumentId} run={run} stock={selectedStock} onClose={() => setTab('stocks')}/> : <Empty description="No stock results available"/>}
      </> },
      { key:'eligibility',label:'Paper eligibility',children:<BacktestPaperEligibility key={run._id} run={run}/> },
      { key: 'data', label: 'Data & settings', children: <>
        <BacktestSelectionAudit run={run}/>
        <Collapse className="bt-diagnostic-groups" defaultActiveKey={incomplete ? ['quality'] : []} items={[
          {key:'quality',label:'Data quality & test limitations',children:<>
    {incomplete && <Alert className="mb-5" showIcon type="warning" title="Data incomplete - research only" description="Some required observations are unavailable. The displayed returns are conditional on the stored data. Repair the history or select a complete stock/date scope and rerun before using this report for paper trading." />}
    {run.config.universe === 'current' && <Alert className="mb-5" showIcon type="warning" title="Research using today's qualified stocks" description="The stock list was selected later than this test period. These results demonstrate strategy behaviour, not an unbiased historical stock-selection test." />}
    {!!(result.historyQuality?.incompleteSessions || result.historyQuality?.missingExitSessions) && <Alert className="mb-5" showIcon type="warning" title={result.historyQuality?.incompleteSessions ? "Historical candles have gaps" : "Historical exit liquidity is incomplete"} description={<>
      <p>{result.historyQuality!.incompleteSessions} of {result.historyQuality!.sessionsChecked} stock sessions have missing minutes. Missing candles are not invented; signals, stop timing and returns may be affected.</p>
      {!!result.historyQuality!.missingExitSessions && <p>{result.historyQuality!.missingExitSessions} sessions have no traded candle at or after the 15:15 intraday exit time. Such exits wait for the next available bar, which can be the next day; the report cannot establish reliable intraday performance.</p>}
    </>} />}
    {!!result.zeroVolumeBars && <Alert className="mb-5" showIcon type="info" title={result.zeroVolumeBars.toLocaleString('en-IN') + ' candles had no traded volume'} description="These candles can inform indicators but cannot fill an entry, stop, target or exit. Thinly traded stocks may have delayed exits." />}
    {!run.strategy.risk.overnight && result.openPositions.length > 0 && <Alert className="mb-5" showIcon type="warning" title="Intraday positions could not be closed in the stored history" description="These positions remain valued at their last stored close. This is a historical-data limitation, not permission to hold overnight. Paper trading still attempts a session exit using fresh market ticks." />}
          </>},
          {key:'decisions',label:'Skipped trades & execution notes',children:<>
    {!!result.warmupDecisions&&<Alert className="mb-5" type="info" showIcon title={`${result.warmupDecisions} initial entry checks waited for indicator warm-up`} description="No trade is invented during warm-up. Stocks that never become ready, missing observations after readiness, and missing exit data still block report handoff."/>}
    {result.unavailableDecisions > 0 && <Alert type="warning" showIcon title={`${result.unavailableDecisions} decisions had insufficient data and were skipped`} description={result.unavailableInputs?.length ? <ul>{result.unavailableInputs.map(item => <li key={`${item.field}:${item.reason}`}><strong>{fieldLabel(item.field)}</strong> ({item.checks} checks): {item.reason}</li>)}</ul> : undefined} className="mb-5"/>}
    {!!run.reportPreparation?.unavailable.length && <Alert type="warning" showIcon className="mb-5" title={`${run.reportPreparation.unavailable.length} exchange reports unavailable`} description={<>
      <p>{run.reportPreparation.ready} of {run.reportPreparation.total} reports ready. Other downloads continued; conditions needing missing reports remain unavailable. Downloaded reports must also have been known at each historical decision time.</p>
      <details><summary>View missing report dates</summary><ul>{run.reportPreparation.unavailable.map(item => <li key={`${item.exchange}:${item.date}`}>{item.exchange} · {item.date}: {item.message}</li>)}</ul></details>
    </>} />}
    {!!result.invalidStopEntries && <Alert type="warning" showIcon title={`${result.invalidStopEntries} entries skipped: initial SL was invalid at the fill price`} className="mb-5" />}
    {!!result.stopLimitEntries && <Alert type="info" showIcon title={`${result.stopLimitEntries} entries skipped: initial stop exceeded the maximum distance from the buy price`} description="The limit is checked against the simulated entry after slippage. The chosen stop stays unchanged; entries outside the limit are skipped." className="mb-5" />}
    {!!result.unfilledLimitEntries && <Alert type="info" showIcon title={`${result.unfilledLimitEntries} limit buys expired without a fill`} className="mb-5" />}
    {!!result.invalidTargetEntries && <Alert type="warning" showIcon title={`${result.invalidTargetEntries} entries skipped: profit targets were invalid at the entry price`} description="Every target must be above the actual entry and at least ₹0.01 apart. Review exact prices for the stocks being tested, or use percentage / rupee gains from entry." className="mb-5" />}
          <p>These details explain why an entry or exit may not have occurred. They are not all errors.</p></>},
        ]}/>
        {!!result.historyQuality?.affected.length && <Table size="small" rowKey="instrumentId" dataSource={result.historyQuality.affected} pagination={{pageSize:10}} scroll={{x:560}} columns={[
          {title:'Affected stock',dataIndex:'instrumentId',render:symbol},{title:'Missing minutes',dataIndex:'missingMinutes'},{title:'Incomplete sessions',dataIndex:'incompleteSessions'},{title:'Missing exit sessions',dataIndex:'missingExitSessions'},
        ]}/>}
        {!!result.unreadyInstruments?.length && <p>Insufficient indicator history: {result.unreadyInstruments.map(symbol).join(', ')}</p>}
        <Descriptions size="small" className="mb-5" items={[
      { key: 'targets', label: 'Profit-taking plan', children: <ProfitTargetSummary risk={run.strategy.risk} /> },
      { key: 'stops', label: 'Stop management', children: <StopManagementSummary risk={run.strategy.risk} /> },
      { key: 'entry', label: 'Entry order', children: run.strategy.risk.entryOrderType === 'limit' ? `Limit ≤ ${researchMoney(run.strategy.risk.entryLimitPrice!)}` : 'Next available bar open' },
        { key: 'engine', label: 'Calculation version', children: result.engineVersion ?? 'Earlier engine (version not recorded)' },
        { key: 'candles', label: 'Stored candles used, including warm-up', children: result.inputCandles?.toLocaleString('en-IN') ?? 'Not recorded for this report' },
      ]}/>
        {result.entrySafeguards && <><h4>Entry safeguards</h4><p className="muted">Counts are blocked entry checks, not unique missed trades. Daily loss was reached on {result.entrySafeguards.dailyLossDates.length} sessions. Candle-based checks cannot reproduce every live tick.</p><Descriptions size="small" items={Object.entries(result.entrySafeguards.blocked).map(([key,count])=>({key,label:({cooldown:'Cooldown',dailyEntries:'Daily stock entry limit',dailyLoss:'Daily loss limit',priceDeviation:'Price deviation',oldSignal:'Signal predates exit'} as Record<string,string>)[key]??key,children:count}))}/></>}
        {run.historyReview && <p>History recheck: {run.historyReview.checkedSessions} sessions checked, {run.historyReview.recoveredCandles} candles recovered, {run.historyReview.providerMissingSessions} sessions still omitted by the provider, {run.historyReview.failedChecks} checks unavailable, {run.historyReview.deferredSessions} deferred by the request budget.</p>}
        {result.historyQuality?.leadingMissingMinutes !== undefined && <p>Missing minutes: {result.historyQuality.leadingMissingMinutes} before the first reported candle, {result.historyQuality.internalMissingMinutes} between candles, {result.historyQuality.trailingMissingMinutes} after the last candle; {result.historyQuality.noCandleSessions} entire sessions unavailable. An absent minute may mean no reported trade or a provider omission; it is never fabricated.</p>}
        {!!result.expiredSignalOrders && <p>{result.expiredSignalOrders} unfilled signal orders expired before a tradable candle became available.</p>}
        <Table size="small"  rowKey="instrumentId" pagination={false} dataSource={result.coverage ?? []} scroll={{ x: 600 }} columns={[
        { title: 'Stock', dataIndex: 'instrumentId', render: symbol }, { title: 'Replay bars', dataIndex: 'bars' }, { title: 'First bar', dataIndex: 'from', render: time }, { title: 'Last bar', dataIndex: 'to', render: time },
      ]}/>{result.assumptions.map(item => <p key={item} className="muted mt-3">{item}</p>)}</> },
    ]}/>
  </Card>;
}
