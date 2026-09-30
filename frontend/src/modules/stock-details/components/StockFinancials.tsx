import { useState } from 'react';
import { Alert, Button, Empty, Segmented, Select, Skeleton, Table, Tag } from 'antd';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { useStockResource } from '../hooks/useStockResource';
import type { FinancialStatement, StockFinancialData } from '../types/financials';
import { financialPeriodLabel, financialRows } from '../utils/financials';
import { stockNumber, stockSigned, stockTone } from '../utils/format';

const metrics = { revenue: 'Revenue', netProfit: 'Net profit', ebitda: 'EBITDA', eps: 'EPS' } as const;
type Metric = keyof typeof metrics;
function FinancialResults({ statements }: { statements: FinancialStatement[] }) {
  const [frequency, setFrequency] = useState<'quarterly' | 'annual'>('quarterly');
  const [preferredBasis, setBasis] = useState<'consolidated' | 'standalone'>('consolidated');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [showAll, setShowAll] = useState(false);
  const available = statements.filter(s => s.frequency === frequency);
  const basis = available.some(s => s.basis === preferredBasis) ? preferredBasis : available[0]?.basis ?? preferredBasis;
  const rows = financialRows(available.find(s => s.basis === basis)?.periods ?? []);
  const shown = showAll ? rows : rows.slice(frequency === 'annual' ? -5 : -8);
  const latest = rows.at(-1), annual = frequency === 'annual';
  const money = (value: number | null) => value === null ? '—' : `₹${stockNumber(value)} Cr`;
  const chartRows = shown.map(row => ({ ...row, label: financialPeriodLabel(row.period) }));
  const growth = (value: number | null) => <span className={stockTone(value)}>{stockSigned(value, '%')}</span>;
  return <>
    <div className="financial-controls">
      <Segmented aria-label="Financial reporting frequency" value={frequency} options={[{ label: 'Quarterly', value: 'quarterly' }, { label: 'Yearly', value: 'annual' }]} onChange={setFrequency}/>
      <Select virtual={false} aria-label="Financial statement basis" value={basis} onChange={setBasis} options={(['consolidated', 'standalone'] as const).map(value => ({ value, label: value === 'consolidated' ? 'Consolidated' : 'Standalone', disabled: !available.some(s => s.basis === value) }))}/>
    </div>
    <p className="muted">{basis === 'consolidated' ? 'Company and its subsidiaries together.' : 'The company on its own, excluding subsidiaries.'} {annual ? 'Annual results' : 'Quarterly results'} · Amounts in ₹ crore; EPS in ₹ per share.</p>
    {!rows.length ? <Empty description={`No ${annual ? 'annual' : 'quarterly'} statements available from this source.`}/> : <>
      <div className="stock-section-heading"><span>Latest reported results</span><Tag>{financialPeriodLabel(latest!.period, annual)}</Tag></div>
      <div className="financial-highlights">
        <div><span>Revenue</span><strong>{money(latest!.revenue)}</strong><small>{growth(latest!.revenueGrowth)} vs same period last year</small></div>
        <div><span>Net profit / loss</span><strong className={stockTone(latest!.netProfit)}>{money(latest!.netProfit)}</strong><small>{growth(latest!.profitGrowth)} vs same period last year</small></div>
      </div>
      <div className="financial-controls"><Segmented aria-label="Financial chart metric" value={metric} options={Object.entries(metrics).map(([value, label]) => ({ value, label }))} onChange={v => setMetric(v as Metric)}/><Select virtual={false} aria-label="Financial periods shown" value={showAll ? 'all' : 'recent'} onChange={v => setShowAll(v === 'all')} options={[{ value: 'recent', label: annual ? 'Latest 5 years' : 'Latest 8 quarters' }, { value: 'all', label: 'All available periods' }]}/></div>
      <div className="financial-chart" role="figure" aria-label={`${metrics[metric]} by ${annual ? 'year' : 'quarter'}`}>
        {chartRows.some(row => row[metric] !== null) ? <ResponsiveContainer width="100%" height={260}><BarChart data={chartRows} margin={{ top: 14, right: 8, bottom: 8, left: 12 }} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} axisLine={false} tickLine={false}/>
          <YAxis domain={([min, max]) => [Math.min(0, min), Math.max(0, max)]} width={65} tick={{ fontSize: 11 }} tickFormatter={v => Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)} axisLine={false} tickLine={false}/>
          <Tooltip cursor={{ fill: 'var(--surface-alt, var(--surface))' }} contentStyle={{ background: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 8 }} formatter={value => typeof value === 'number' ? metric === 'eps' ? `₹${stockNumber(value)} / share` : money(value) : '—'}/>
          <ReferenceLine y={0} stroke="var(--border)"/>
          <Bar dataKey={metric} name={metrics[metric]} maxBarSize={56} isAnimationActive={false}>{chartRows.map(row => <Cell key={row.period} fill={(row[metric] ?? 0) < 0 ? '#df5a67' : '#4866de'}/>)}</Bar>
        </BarChart></ResponsiveContainer> : <Empty description={`${metrics[metric]} is unavailable for these periods.`}/>}
      </div>
      <Table<ReturnType<typeof financialRows>[number]> className="financial-table" size="small" rowKey="period" dataSource={[...shown].reverse()} pagination={shown.length > 12 ? { pageSize: 12, showSizeChanger: false } : false} scroll={{ x: 760 }} columns={[
        { title: annual ? 'Year ended' : 'Quarter ended', dataIndex: 'period', render: (v: string) => financialPeriodLabel(v), width: 120 },
        { title: 'Revenue (₹ Cr)', dataIndex: 'revenue', align: 'right', render: (v: number | null) => stockNumber(v) },
        { title: 'Revenue YoY', dataIndex: 'revenueGrowth', align: 'right', render: growth },
        { title: 'Net profit (₹ Cr)', dataIndex: 'netProfit', align: 'right', render: (v: number | null) => <span className={stockTone(v)}>{stockNumber(v)}</span> },
        { title: 'Profit YoY', dataIndex: 'profitGrowth', align: 'right', render: growth },
        { title: 'EBITDA (₹ Cr)', dataIndex: 'ebitda', align: 'right', render: (v: number | null) => stockNumber(v) },
        { title: 'EPS (₹)', dataIndex: 'eps', align: 'right', render: (v: number | null) => stockNumber(v) },
      ]}/>
      <p className="stock-chart-note">YoY compares the same reporting period one year earlier on the same accounting basis. Growth is unavailable when that period is missing or its value is zero or negative. Negative net profit is a loss.</p>
    </>}
    <p className="stock-chart-note">Revenue follows the provider’s total-income field, including other income; it can differ from revenue from operations. Net profit is the reported profit after tax. Statements are current reported snapshots and may include revisions; they are not point-in-time backtest inputs.</p>
  </>;
}

export function StockFinancials({ instrumentId }: { instrumentId: string }) {
  const resource = useStockResource<StockFinancialData>(`/stocks/${encodeURIComponent(instrumentId)}/financials`);
  const data = resource.data;
  return <section className="stock-research-section" aria-label="Financial performance">
    <div className="stock-section-heading"><div><h3>Financial performance</h3><p className="muted">Reported revenue and profit over time</p></div><Button size="small" loading={resource.loading} onClick={resource.retry}>Refresh</Button></div>
    {(resource.error || data?.message) && <Alert type="warning" showIcon title={data?.statements?.length ? 'Showing saved financial statements' : 'Financial statements unavailable'} description={resource.error || data?.message}/>}
    {resource.loading && !data ? <Skeleton active paragraph={{ rows: 5 }}/> : data?.statements?.length ? <FinancialResults key={instrumentId} statements={data.statements}/> : !resource.error && !data?.message ? <Empty description="No financial statements available for this company."/> : null}
    {data?.fetchedAt && <p className="stock-chart-note">{data.source} · Retrieved {new Date(data.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · Checks for updates daily. {data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer">View source</a>}</p>}
  </section>;
}
