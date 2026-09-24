import { useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Drawer, Empty, Segmented, Skeleton, Space, Tag, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, ReloadOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import { StockCandlestickChart } from '../../../components/charts/StockCandlestickChart';
import { MonthlyRuleSummary } from '../../qualification/components/MonthlyRuleSummary';
import { StockIndexTags } from '../../qualification/components/StockIndexTags';
import type { QualifiedStock } from '../../qualification/types/backend';
import { useStockQuotes } from '../hooks/useStockQuotes';
import { useStockResource } from '../hooks/useStockResource';
import { StockChange, StockPrice } from './StockPrice';
import { stockMoney, stockNumber, stockTime } from '../utils/format';
import type { StockChartData, StockDetail, StockFact, StockTimeframe } from '../types';
import '../../../styles/stock-details.css';

const timeframes = [{ label: '1m', value: '1m' }, { label: '5m', value: '5m' }, { label: '15m', value: '15m' }, { label: '1D', value: '1d' }, { label: '1W', value: '1w' }, { label: '1M', value: '1mo' }];
const metrics = [
  ['marketCap', 'Market cap', ' Cr'], ['pe', 'P/E', ''], ['pb', 'Price / book', ''], ['eps', 'EPS', ''],
  ['roe', 'Return on equity', '%'], ['roce', 'Return on capital', '%'], ['debtEquity', 'Debt / equity', ''], ['promoterHolding', 'Promoter holding', '%'],
] as const;
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stock-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function factPeriod(fact?: StockFact) { return fact?.period ? `Period ${fact.period}` : fact ? `Observed ${new Date(fact.observedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not available'; }

function StockDetails({ stock }: { stock: QualifiedStock }) {
  const [timeframe, setTimeframe] = useState<StockTimeframe>('1d'), [kind, setKind] = useState<'candles' | 'line'>('candles'), [showEma, setShowEma] = useState(true);
  const detail = useStockResource<StockDetail>(`/stocks/${encodeURIComponent(stock.instrumentId)}`);
  const chart = useStockResource<StockChartData>(`/stocks/${encodeURIComponent(stock.instrumentId)}/chart?timeframe=${timeframe}`, 60_000);
  const { quotes, status, error, now } = useStockQuotes([stock.instrumentId]);
  const quote = quotes[stock.instrumentId], data = detail.data, facts = new Map(data?.facts.map(fact => [fact.field, fact]) ?? []);
  const membership = data?.qualification, indices = facts.get('index')?.value ?? stock.metrics.index;
  const source = membership?.source ?? stock.source;
  return <div className="stock-detail-content">
    <section className="stock-quote-overview" aria-label="Stock quote">
      <div className="stock-quote-main"><StockPrice quote={quote} connected={status.state === 'streaming'} now={now} large /><StockChange quote={quote} /></div>
      <p className="stock-quote-timestamp">{quote ? `Last trade · ${stockTime(quote.lastTradeAt)}` : 'Waiting for a stock quote…'} <span>INR · {stock.instrument?.exchange} · {quote?.source === 'historical-close' ? 'Stored daily close' : 'Dhan'}</span></p>
      {(error || status.message) && <Alert type="warning" showIcon title={error || status.message} />}
      <div className="stock-session-metrics">
        <Metric label="Open" value={stockMoney(quote?.open)} /><Metric label="Day high" value={stockMoney(quote?.high)} /><Metric label="Day low" value={stockMoney(quote?.low)} />
        <Metric label="Previous close" value={stockMoney(quote?.previousClose)} /><Metric label="Volume" value={quote?.volume != null ? quote.volume.toLocaleString('en-IN') : '—'} />
        <Metric label="Average price" value={stockMoney(quote?.averagePrice)} />
      </div>
    </section>
    <section className="stock-chart-section" aria-label="Price chart">
      <div className="stock-section-heading"><h3>Price & volume</h3><Space size={8}><Checkbox checked={showEma} onChange={event => setShowEma(event.target.checked)}>EMA <span className="stock-ema-fast">5</span> / <span className="stock-ema-slow">21</span></Checkbox><Tooltip title="Refresh chart history"><Button aria-label="Refresh chart" icon={<ReloadOutlined />} loading={chart.loading} onClick={chart.retry} size="small" /></Tooltip></Space></div>
      <div className="stock-chart-controls"><Segmented aria-label="Chart timeframe" size="small" value={timeframe} options={timeframes} onChange={value => setTimeframe(value as StockTimeframe)} /><Segmented aria-label="Chart style" size="small" value={kind} options={[{ value: 'candles', label: 'Candles' }, { value: 'line', label: 'Line' }]} onChange={value => setKind(value as 'candles' | 'line')} /></div>
      {(chart.error || chart.data?.message) && <Alert className="stock-inline-alert" type="warning" showIcon title={chart.error || chart.data?.message} action={<Button size="small" onClick={chart.retry}>Retry</Button>} />}
      {chart.loading && !chart.data ? <div className="stock-chart-loading"><Skeleton active paragraph={{ rows: 5 }} /><p>Loading price history. The first download can take longer.</p></div> : chart.data?.bars.length ?
        <StockCandlestickChart key={timeframe} bars={chart.data.bars} quote={quote} timeframe={timeframe} showEma={showEma} kind={kind} symbol={stock.instrument?.symbol ?? stock.instrumentId} /> :
        <div className="stock-chart-empty"><Empty description="No chart history available for this interval" /><Button onClick={chart.retry}>Try again</Button></div>}
      <p className="stock-chart-note">{['1m', '5m', '15m'].includes(timeframe) ? 'Completed candles · recent 7 days · refreshes every minute.' : 'Daily history · up to 6 years. Current week and month may still be forming.'} The dashed LTP line follows the latest quote. Monthly qualification uses completed months.</p>
    </section>
    <section className="stock-company-section" aria-label="Company details">
      <div className="stock-section-heading"><h3>Company snapshot</h3><span className="muted">Dated fundamentals</span></div>
      {(detail.error || data?.message) && <Alert className="stock-inline-alert" type="warning" title={detail.error || data?.message} action={<Button size="small" onClick={detail.retry}>Retry</Button>} />}
      {detail.loading && !data ? <Skeleton active paragraph={{ rows: 2 }} /> : <>
        <div className="stock-company-meta"><Tag>{String(facts.get('sector')?.value ?? stock.metrics.sector ?? 'Sector unavailable')}</Tag><span className="muted">ISIN {data?.instrument.isin ?? stock.isin}</span></div>
        <div className="stock-fundamentals">{metrics.map(([field, label, suffix]) => { const fact = facts.get(field); return <Metric key={field} label={label} value={typeof fact?.value === 'number' ? `${field === 'marketCap' || field === 'eps' ? '₹' : ''}${stockNumber(fact.value)}${suffix}` : '—'} note={factPeriod(fact)} />; })}</div>
        {Array.isArray(indices) && indices.length > 0 && <div className="stock-detail-indices"><span>Index memberships</span><StockIndexTags indices={indices.map(String)} /></div>}
      </>}
    </section>
    <section className="stock-qualification-section" aria-label="Qualification context">
      <div className="stock-section-heading"><h3>Why it’s in your list</h3><Tag color={source === 'manual' ? 'purple' : 'green'}>{source === 'manual' ? 'Manually added' : 'From monthly scan'}</Tag></div>
      {source === 'manual' ? <><p className="stock-manual-note">{membership?.note ?? stock.note ?? 'Added using your own qualification criteria.'}</p><p className="muted">Your custom addition. This stock is not marked as passing the monthly scan rules.</p></> : <>
        <p>Qualified in the published monthly scan{membership?.month ? ` for ${membership.month}` : ''}.</p>
        <p className="muted">{membership?.cutoff ? `Scan cutoff · ${stockTime(membership.cutoff)}. ` : ''}Current prices and updated company data do not change that saved result.</p>
        {membership?.rule && <Collapse ghost items={[{ key: 'rule', label: 'View qualification rules', children: <MonthlyRuleSummary rule={membership.rule} /> }]} />}
      </>}
    </section>
  </div>;
}

export function StockDetailDrawer({ stock, onClose, onPrevious, onNext }: { stock?: QualifiedStock; onClose: () => void; onPrevious?: () => void; onNext?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return <Drawer open={!!stock} onClose={onClose} destroyOnHidden size={expanded ? '100vw' : 1040} className="stock-detail-drawer" title={<div className="stock-drawer-title"><strong>{stock?.instrument?.symbol ?? stock?.instrumentId}</strong><span>{stock?.instrument?.name} · {stock?.instrument?.exchange}</span></div>} extra={<Space size={4}>
    <Button aria-label="Previous stock" icon={<LeftOutlined />} disabled={!onPrevious} onClick={onPrevious} type="text" /><Button aria-label="Next stock" icon={<RightOutlined />} disabled={!onNext} onClick={onNext} type="text" />
    <Button aria-label={expanded ? 'Restore panel width' : 'Expand stock details'} icon={expanded ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setExpanded(x => !x)} type="text" />
  </Space>}>
    {stock && <StockDetails key={stock.instrumentId} stock={stock} />}
  </Drawer>;
}
