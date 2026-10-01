import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import { fieldLabel } from '../../qualification/config/ruleFields';
import { useMemo, useState } from 'react';
import { StockChartButton } from '../../stock-details/components/StockChartButton';
import { BacktestStockChart } from './BacktestStockChart';
import { BacktestStockResults } from './BacktestStockResults';
import { backtestStockResults } from '../utils/stockResults';
import { ReportPnl } from './ReportPnl';
import '../../../styles/backtest-report.css';
import { Alert, Button, Card, Col, Descriptions, Row, Space, Statistic, Table, Tabs, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ProfitTargetSummary } from '../../strategies/components/ProfitTargetSummary';
import { StopManagementSummary } from '../../strategies/components/StopManagementSummary';
import type { BackendBacktest } from '../types/backend';
const researchMoney = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const time = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
export function BackendBacktestReport({ run }: { run: BackendBacktest }) {
  const navigate = useNavigate(), result = run.result;
  const [chartStock, setChartStock] = useState<string>();
  const stocks = useMemo(() => backtestStockResults(run), [run]);
  const selectedStock = stocks.find(stock => stock.instrumentId === chartStock);
  const closedTrades = stocks.reduce((sum, stock) => sum + stock.closedTrades, 0);
  const wins = stocks.reduce((sum, stock) => sum + stock.wins, 0);
  if (!result) return null;
  const symbol = (id: string) => run.symbols?.[id] ?? id;
  return <Card className="backend-backtest-report" title={<Space wrap>{run.strategy.name}<Tag color="green">Completed</Tag></Space>} extra={<Button onClick={() => navigate(`/signal-runner?strategy=${run.strategy._id}&backtest=${run._id}&setup=1`)}>Use for paper trading</Button>}>
    <p className="muted">{date(run.config.from)} – {date(new Date(Date.parse(run.config.to) - 1).toISOString())} · {run.config.ids.length} stocks · Saved strategy revision {run.strategy.revision}</p><StrategyHistoryButton strategy={run.strategy} context="This backtest report" />
    {run.config.universe === 'current' && <Alert className="mb-5" showIcon type="warning" title="Research using today's qualified stocks" description="The stock list was selected later than this test period. These results demonstrate strategy behaviour, not an unbiased historical stock-selection test." />}
    {!!result.historyQuality?.incompleteSessions && <Alert className="mb-5" showIcon type="warning" title="Historical candles have gaps" description={<>
      <p>{result.historyQuality.incompleteSessions} of {result.historyQuality.sessionsChecked} observed stock sessions have missing minutes. Missing candles are not invented; signals, stop timing and returns may be affected.</p>
      {!!result.historyQuality.missingExitSessions && <p>{result.historyQuality.missingExitSessions} sessions have no stored candle at or after the 15:15 intraday exit time. Such exits wait for the next available bar, which can be the next day; the report cannot establish reliable intraday performance.</p>}
    </>} />}
    {!run.strategy.risk.overnight && result.openPositions.length > 0 && <Alert className="mb-5" showIcon type="warning" title="Intraday positions could not be closed in the stored history" description="These positions remain valued at their last stored close. This is a historical-data limitation, not permission to hold overnight. Paper trading still attempts a session exit using fresh market ticks." />}
    <Row className="bt-report-summary" gutter={[16, 24]}>{[
      ['Ending equity', researchMoney(result.equity)], ['Net P&L', researchMoney(result.netPnl)], ['Return', `${(result.returnPercent ?? result.netPnl / result.initialCapital * 100).toFixed(2)}%`],
      ['Max drawdown', `${result.maxDrawdownPercent.toFixed(2)}%`], ['Closed trades', closedTrades], ['Win rate', closedTrades ? `${(wins / closedTrades * 100).toFixed(1)}%` : '—'],
    ].map(([title, value]) => <Col xs={12} xl={4} key={title}><Statistic title={title} value={value} /></Col>)}</Row>
    {result.unavailableDecisions > 0 && <Alert type="warning" showIcon title={`${result.unavailableDecisions} decisions had insufficient data and were skipped`} description={result.unavailableInputs?.length ? <ul>{result.unavailableInputs.map(item => <li key={`${item.field}:${item.reason}`}><strong>{fieldLabel(item.field)}</strong> ({item.checks} checks): {item.reason}</li>)}</ul> : undefined} className="mb-5"/>}
    {!!run.reportPreparation?.unavailable.length && <Alert type="warning" showIcon className="mb-5" title={`${run.reportPreparation.unavailable.length} exchange reports unavailable`} description={<>
      <p>{run.reportPreparation.ready} of {run.reportPreparation.total} reports ready. Other downloads continued; conditions needing missing reports remain unavailable. Downloaded reports must also have been known at each historical decision time.</p>
      <details><summary>View missing report dates</summary><ul>{run.reportPreparation.unavailable.map(item => <li key={`${item.exchange}:${item.date}`}>{item.exchange} · {item.date}: {item.message}</li>)}</ul></details>
    </>} />}
    {!!result.invalidStopEntries && <Alert type="warning" showIcon title={`${result.invalidStopEntries} entries skipped: initial SL was invalid at the fill price`} className="mb-5" />}
    {!!result.stopLimitEntries && <Alert type="info" showIcon title={`${result.stopLimitEntries} entries skipped: initial stop exceeded the maximum distance from the buy price`} description="The limit is checked against the simulated entry after slippage. The chosen stop stays unchanged; entries outside the limit are skipped." className="mb-5" />}
    {!!result.unfilledLimitEntries && <Alert type="info" showIcon title={`${result.unfilledLimitEntries} limit buys expired without a fill`} className="mb-5" />}
    {!!result.invalidTargetEntries && <Alert type="warning" showIcon title={`${result.invalidTargetEntries} entries skipped: profit targets were invalid at the entry price`} description="Every target must be above the actual entry and at least ₹0.01 apart. Review exact prices for the stocks being tested, or use percentage / rupee gains from entry." className="mb-5" />}
    <Tabs items={[
      { key: 'stocks', label: `Stock results (${stocks.length})`, children: <BacktestStockResults stocks={stocks} onSelect={setChartStock}/> },
      { key: 'portfolio', label: 'Portfolio overview', children: <>
    <div style={{ height: 300, width: '100%', marginTop: 24 }} aria-label="Backtest equity curve"><ResponsiveContainer><AreaChart data={result.curve}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2}/><XAxis dataKey="at" tickFormatter={date} minTickGap={60}/><YAxis width={90} domain={['auto', 'auto']} tickFormatter={value => `₹${Math.round(Number(value) / 1000)}k`}/>
      <Tooltip labelFormatter={value => time(String(value))} formatter={value => [researchMoney(Number(value)), 'Equity']}/><ReferenceLine y={result.initialCapital} stroke="#94a3b8" strokeDasharray="4 4"/>
      <Area type="linear" dataKey="equity" stroke={result.netPnl >= 0 ? '#059669' : '#e5484d'} fill={result.netPnl >= 0 ? '#059669' : '#e5484d'} fillOpacity={0.1} dot={false} isAnimationActive={false}/>
    </AreaChart></ResponsiveContainer></div>
    <Descriptions size="small" items={[
      { key: 'targets', label: 'Profit-taking plan', children: <ProfitTargetSummary risk={run.strategy.risk} /> },
      { key: 'stops', label: 'Stop management', children: <StopManagementSummary risk={run.strategy.risk} /> },
      { key: 'entry', label: 'Entry order', children: run.strategy.risk.entryOrderType === 'limit' ? `Limit ≤ ${researchMoney(run.strategy.risk.entryLimitPrice!)}` : 'Next available bar open' },
      { key: 'capital', label: 'Starting capital', children: researchMoney(result.initialCapital) },
      { key: 'realized', label: 'Realized P&L', children: researchMoney(result.realizedPnl ?? 0) },
      { key: 'fees', label: 'Estimated fees', children: researchMoney(result.totalFees ?? 0) },
      { key: 'pf', label: 'Profit factor', children: result.profitFactor == null ? '—' : result.profitFactor.toFixed(2) },
      { key: 'open', label: 'Still holding', children: `${result.openPositions.length} positions` },
      { key: 'missing', label: 'Unavailable rule checks', children: result.unavailableDecisions },
    ]}/>
      </> },
      { key: 'open', label: `Open positions (${result.openPositions.length})`, children: <Table size="small" rowKey="instrumentId" dataSource={result.openPositions} pagination={false} scroll={{ x: 600 }} columns={[
        { title: 'Stock', dataIndex: 'instrumentId', render: id => <StockChartButton symbol={symbol(id)} onClick={() => setChartStock(id)}/> }, { title: 'Shares', dataIndex: 'quantity' }, { title: 'Entry', dataIndex: 'entry', render: value => researchMoney(value / 100) },
        { title: 'Initial risk (1R)', dataIndex: 'initialRiskPaise', render: value => value ? researchMoney(value / 100) : '—' },
        { title: 'Stop', render: (_, row) => <Space>{researchMoney(row.stop)}{row.trailingActivated && <Tag color="purple">Trailing</Tag>}{row.breakevenActivated && <Tag color="blue">At entry or higher</Tag>}</Space> }, { title: 'Next target', dataIndex: 'target', render: researchMoney },
        { title: 'Final close', dataIndex: 'mark', render: researchMoney }, { title: 'Unrealized P&L', render: (_, row) => <ReportPnl value={row.mark * row.quantity - row.cost / 100}/> },
      ]}/> },
      { key: 'data', label: 'Data & assumptions', children: <><Table size="small" rowKey="instrumentId" pagination={false} dataSource={result.coverage ?? []} scroll={{ x: 600 }} columns={[
        { title: 'Stock', dataIndex: 'instrumentId', render: symbol }, { title: 'Replay bars', dataIndex: 'bars' }, { title: 'First bar', dataIndex: 'from', render: time }, { title: 'Last bar', dataIndex: 'to', render: time },
      ]}/>{result.assumptions.map(item => <p key={item} className="muted mt-3">{item}</p>)}</> },
    ]}/>
    {selectedStock && <BacktestStockChart key={selectedStock.instrumentId} run={run} stock={selectedStock} onClose={() => setChartStock(undefined)}/>}
  </Card>;
}
