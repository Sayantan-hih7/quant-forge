import { useState, type ReactNode } from 'react';
import { Alert, Button, Collapse, Drawer, Skeleton, Space, Tag } from 'antd';
import { LeftOutlined, RightOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import { StockChartPanel } from './StockChartPanel';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { MonthlyRuleSummary } from '../../qualification/components/MonthlyRuleSummary';
import { StockIndexTags } from '../../qualification/components/StockIndexTags';
import { useStockQuotes } from '../hooks/useStockQuotes';
import { useStockResource } from '../hooks/useStockResource';
import { StockChange, StockPrice } from './StockPrice';
import { stockMoney, stockNumber, stockTime, stockSource, isQuoteConnected } from '../utils/format';
import { StockFeedStatus } from './StockFeedStatus';
import type { ChartEvent, ChartLevel, StockDetail, StockFact, StockSelection } from '../types';
import '../../../styles/stock-details.css';

const metrics = [
  ['marketCap', 'Market cap', ' Cr'], ['pe', 'P/E', ''], ['pb', 'Price / book', ''], ['eps', 'EPS', ''],
  ['roe', 'Return on equity', '%'], ['roce', 'Return on capital', '%'], ['debtEquity', 'Debt / equity', ''], ['promoterHolding', 'Promoter holding', '%'], ['pledge', 'Promoter encumbrance', '%'],
] as const;
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stock-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function factPeriod(fact?: StockFact) {
  if (!fact) return 'Not available';
  const period = fact.period ? `Period ${fact.period}` : `Observed ${new Date(fact.observedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}`;
  return [period, fact.statementBasis, fact.calculation ? 'Calculated from annual statements' : fact.source === 'dhan-public-company' ? 'Dhan financials' : undefined].filter(Boolean).join(' · ');
}

interface ChartContextProps { strategy?: SavedStrategy; events?: ChartEvent[]; levels?: ChartLevel[]; focusEventId?: string; onSelectEvent?: (id: string) => void; tradeContent?: ReactNode }
function StockDetails({ stock, strategy, events, levels, focusEventId, onSelectEvent, tradeContent }: { stock: StockSelection } & ChartContextProps) {
  const detail = useStockResource<StockDetail>(`/stocks/${encodeURIComponent(stock.instrumentId)}`);
  const { quotes, status, error, now, liveBars } = useStockQuotes([stock.instrumentId], true, true);
  const quote = quotes[stock.instrumentId], data = detail.data, facts = new Map(data?.facts.map(fact => [fact.field, fact]) ?? []);
  const membership = data?.qualification, indices = facts.get('index')?.value ?? stock.metrics?.index;
  const source = membership?.source ?? stock.source;
  return <div className="stock-detail-content">
    <section className="stock-quote-overview" aria-label="Stock quote">
      <div className="stock-quote-main"><StockPrice quote={quote} connected={isQuoteConnected(quote, status)} now={now} large /><StockChange quote={quote} /></div>
      <p className="stock-quote-timestamp">{quote ? `Last trade · ${stockTime(quote.lastTradeAt)}` : 'Waiting for a stock quote…'} <span>INR · {stock.instrument?.exchange}{quote ? ` · ${stockSource(quote)}` : ''}</span></p>
      <StockFeedStatus status={status} />
      {status.state !== 'streaming' && !status.marketClosed && (error || status.message) && <Alert type="warning" showIcon title={error || status.message} />}
      <div className="stock-session-metrics">
        <Metric label="Open" value={stockMoney(quote?.open)} /><Metric label="Day high" value={stockMoney(quote?.high)} /><Metric label="Day low" value={stockMoney(quote?.low)} />
        <Metric label="Previous close" value={stockMoney(quote?.previousClose)} /><Metric label="Volume" value={quote?.volume != null ? quote.volume.toLocaleString('en-IN') : '—'} />
        <Metric label="Average price" value={stockMoney(quote?.averagePrice)} />
      </div>
    </section>
    <StockChartPanel instrumentId={stock.instrumentId} symbol={stock.instrument?.symbol ?? data?.instrument.symbol ?? stock.instrumentId} quote={quote} liveBars={liveBars[stock.instrumentId]} now={now} strategy={strategy} events={events} levels={levels} focusEventId={focusEventId} onSelectEvent={onSelectEvent}/>
    {tradeContent}
    <section className="stock-company-section" aria-label="Company details">
      <div className="stock-section-heading"><h3>Company snapshot</h3><span className="muted">Dated fundamentals</span></div>
      {(detail.error || data?.message) && <Alert className="stock-inline-alert" type="warning" title={detail.error || data?.message} action={<Button size="small" onClick={detail.retry}>Retry</Button>} />}
      {detail.loading && !data ? <Skeleton active paragraph={{ rows: 2 }} /> : <>
        <div className="stock-company-meta"><Tag>{String(facts.get('sector')?.value ?? stock.metrics?.sector ?? 'Sector unavailable')}</Tag><span className="muted">ISIN {data?.instrument.isin ?? stock.isin}</span></div>
        <div className="stock-fundamentals">{metrics.map(([field, label, suffix]) => { const fact = facts.get(field); return <Metric key={field} label={label} value={fact?.value === 'not-applicable' ? 'N/A · no promoters' : typeof fact?.value === 'number' ? `${field === 'marketCap' || field === 'eps' ? '₹' : ''}${stockNumber(fact.value)}${suffix}` : '—'} note={factPeriod(fact)} />; })}</div>
        {facts.get('pledge')?.ownership && <p className="muted">Promoter encumbrance uses pledged shares plus other reported encumbrances, as a percentage of promoter holding. Companies with no promoters meet maximum-encumbrance limits; their percentage is not applicable. <a href={facts.get('pledge')?.sourceUrl} target="_blank" rel="noreferrer">View exchange filing</a></p>}
        {Array.isArray(indices) && indices.length > 0 && <div className="stock-detail-indices"><span>Index memberships</span><StockIndexTags indices={indices.map(String)} /></div>}
      </>}
    </section>
    <section className="stock-qualification-section" aria-label="Qualification context">
      <div className="stock-section-heading"><h3>Monthly qualification</h3>{source && <Tag color={source === 'manual' ? 'purple' : 'green'}>{source === 'manual' ? 'Manually added' : 'From monthly scan'}</Tag>}</div>
      {!source ? <p className="muted">This stock is not in the current published qualified list. You can research it and save it to a watchlist; watching it does not make it eligible for strategy entries.</p> : source === 'manual' ? <><p className="stock-manual-note">{membership?.note ?? stock.note ?? 'Added using your own qualification criteria.'}</p><p className="muted">Your custom addition. This stock is not marked as passing the monthly scan rules.</p></> : <>
        <p>Qualified in the published monthly scan{membership?.month ? ` for ${membership.month}` : ''}.</p>
        <p className="muted">{membership?.cutoff ? `Scan cutoff · ${stockTime(membership.cutoff)}. ` : ''}Current prices and updated company data do not change that saved result.</p>
        {membership?.rule && <Collapse ghost items={[{ key: 'rule', label: 'View qualification rules', children: <MonthlyRuleSummary rule={membership.rule} /> }]} />}
      </>}
    </section>
  </div>;
}

export function StockDetailDrawer({ stock, onClose, onPrevious, onNext, ...context }: { stock?: StockSelection; onClose: () => void; onPrevious?: () => void; onNext?: () => void } & ChartContextProps) {
  const [expanded, setExpanded] = useState(false);
  return <Drawer open={!!stock} onClose={onClose} destroyOnHidden size={expanded ? '100vw' : 1120} className="stock-detail-drawer" title={<div className="stock-drawer-title"><strong>{stock?.instrument?.symbol ?? stock?.instrumentId}</strong><span>{stock?.instrument?.name} · {stock?.instrument?.exchange}</span></div>} extra={<Space size={4}>
    <Button aria-label="Previous stock" icon={<LeftOutlined />} disabled={!onPrevious} onClick={onPrevious} type="text" /><Button aria-label="Next stock" icon={<RightOutlined />} disabled={!onNext} onClick={onNext} type="text" />
    <Button aria-label={expanded ? 'Restore panel width' : 'Expand stock details'} icon={expanded ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setExpanded(x => !x)} type="text" />
  </Space>}>
    {stock && <StockDetails key={`${stock.instrumentId}:${context.strategy?._id ?? 'research'}`} stock={stock} {...context} />}
  </Drawer>;
}
