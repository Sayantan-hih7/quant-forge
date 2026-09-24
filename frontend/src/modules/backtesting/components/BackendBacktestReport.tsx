import { Alert, Button, Card, Col, Descriptions, Row, Space, Statistic, Table, Tabs, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BackendBacktest } from '../types/backend';
const researchMoney = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const time = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
export function BackendBacktestReport({ run }: { run: BackendBacktest }) {
  const navigate = useNavigate(), result = run.result;
  if (!result) return null;
  const symbol = (id: string) => run.symbols?.[id] ?? id;
  return <Card title={<Space wrap>{run.strategy.name}<Tag color="green">Completed</Tag></Space>} extra={<Button onClick={() => navigate(`/signal-runner?strategy=${run.strategy._id}&backtest=${run._id}`)}>Review in Signal Runner</Button>}>
    <p className="muted">{date(run.config.from)} – {date(new Date(Date.parse(run.config.to) - 1).toISOString())} · {run.config.ids.length} stocks · Saved strategy revision {run.strategy.revision}</p>
    {run.config.universe === 'current' && <Alert className="mb-5" showIcon type="warning" title="Research using today's qualified stocks" description="The stock list was selected later than this test period. These results demonstrate strategy behaviour, not an unbiased historical stock-selection test." />}
    <Row gutter={[16, 24]}>{[
      ['Ending equity', researchMoney(result.equity)], ['Net P&L', researchMoney(result.netPnl)], ['Return', `${(result.returnPercent ?? result.netPnl / result.initialCapital * 100).toFixed(2)}%`],
      ['Max drawdown', `${result.maxDrawdownPercent.toFixed(2)}%`], ['Closed trades', result.trades.length], ['Win rate', result.winRate == null ? '—' : `${result.winRate.toFixed(1)}%`],
    ].map(([title, value]) => <Col xs={12} xl={4} key={title}><Statistic title={title} value={value} /></Col>)}</Row>
    <div style={{ height: 300, width: '100%', marginTop: 24 }} aria-label="Backtest equity curve"><ResponsiveContainer><AreaChart data={result.curve}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2}/><XAxis dataKey="at" tickFormatter={date} minTickGap={60}/><YAxis width={90} domain={['auto', 'auto']} tickFormatter={value => `₹${Math.round(Number(value) / 1000)}k`}/>
      <Tooltip labelFormatter={value => time(String(value))} formatter={value => [researchMoney(Number(value)), 'Equity']}/><ReferenceLine y={result.initialCapital} stroke="#94a3b8" strokeDasharray="4 4"/>
      <Area type="linear" dataKey="equity" stroke={result.netPnl >= 0 ? '#059669' : '#e5484d'} fill={result.netPnl >= 0 ? '#059669' : '#e5484d'} fillOpacity={0.1} dot={false} isAnimationActive={false}/>
    </AreaChart></ResponsiveContainer></div>
    <Descriptions size="small" items={[
      { key: 'capital', label: 'Starting capital', children: researchMoney(result.initialCapital) },
      { key: 'realized', label: 'Realized P&L', children: researchMoney(result.realizedPnl ?? 0) },
      { key: 'fees', label: 'Estimated fees', children: researchMoney(result.totalFees ?? 0) },
      { key: 'pf', label: 'Profit factor', children: result.profitFactor == null ? '—' : result.profitFactor.toFixed(2) },
      { key: 'open', label: 'Still holding', children: `${result.openPositions.length} positions` },
      { key: 'missing', label: 'Unavailable rule checks', children: result.unavailableDecisions },
    ]}/>
    {result.unavailableDecisions > 0 && <Alert type="warning" showIcon title={`${result.unavailableDecisions} decisions had insufficient data and were skipped`} className="mb-5"/>}
    <Tabs items={[
      { key: 'trades', label: `Closed trades (${result.trades.length})`, children: <Table size="small" rowKey={r => `${r.instrumentId}:${r.entryAt}:${r.exitAt}`} dataSource={result.trades} pagination={{ pageSize: 8 }} scroll={{ x: 1100 }} columns={[
        { title: 'Stock', dataIndex: 'instrumentId', render: symbol }, { title: 'Bought', dataIndex: 'entryAt', render: time }, { title: 'Sold', dataIndex: 'exitAt', render: time },
        { title: 'Entry', dataIndex: 'entry', render: researchMoney }, { title: 'Exit', dataIndex: 'exit', render: researchMoney }, { title: 'Shares', dataIndex: 'quantity' },
        { title: 'Net P&L', dataIndex: 'pnl', render: value => <span className={value >= 0 ? 'positive' : 'negative'}>{researchMoney(value)}</span> }, { title: 'Exit reason', dataIndex: 'reason' },
      ]}/> },
      { key: 'open', label: `Open positions (${result.openPositions.length})`, children: <Table size="small" rowKey="instrumentId" dataSource={result.openPositions} pagination={false} columns={[
        { title: 'Stock', dataIndex: 'instrumentId', render: symbol }, { title: 'Shares', dataIndex: 'quantity' }, { title: 'Entry', dataIndex: 'entry', render: value => researchMoney(value / 100) },
        { title: 'Final close', dataIndex: 'mark', render: researchMoney }, { title: 'Unrealized P&L', render: (_, row) => researchMoney(row.mark * row.quantity - row.cost / 100) },
      ]}/> },
      { key: 'data', label: 'Data & assumptions', children: <><Table size="small" rowKey="instrumentId" pagination={false} dataSource={result.coverage ?? []} columns={[
        { title: 'Stock', dataIndex: 'instrumentId', render: symbol }, { title: 'Replay bars', dataIndex: 'bars' }, { title: 'First bar', dataIndex: 'from', render: time }, { title: 'Last bar', dataIndex: 'to', render: time },
      ]}/>{result.assumptions.map(item => <p key={item} className="muted mt-3">{item}</p>)}</> },
    ]}/>
  </Card>;
}
