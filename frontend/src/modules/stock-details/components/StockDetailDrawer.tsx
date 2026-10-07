import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Collapse, Drawer, Skeleton, Space, Tag } from 'antd';
import { LeftOutlined, RightOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import { StockQuickSwitch } from './StockQuickSwitch';
import { QuickPaperTrade } from './QuickPaperTrade';
import { StockMonitoringChart } from './StockMonitoringChart';
import { StockMarketDepth } from './StockMarketDepth';
import { StockPerformance } from './StockPerformance';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { MonthlyRuleSummary } from '../../qualification/components/MonthlyRuleSummary';
import { StockIndexTags } from '../../qualification/components/StockIndexTags';
import { useStockQuotes } from '../hooks/useStockQuotes';
import { useStockResource } from '../hooks/useStockResource';
import { StockChange, StockPrice } from './StockPrice';
import { stockNumber, stockTime, stockSource, isQuoteConnected } from '../utils/format';
import { StockFeedStatus } from './StockFeedStatus';
import { StockExchangeSwitch } from './StockExchangeSwitch';
import { RelatedStocks } from './RelatedStocks';
import { useRecentStocks } from '../store/recentStocks';
import { WatchlistButton } from '../../watchlists/components/WatchlistButton';
import { QualificationButton } from '../../qualification/components/QualificationButton';
import { useStockActionData } from '../../watchlists/hooks/useStockActions';
import type { ChartEvent, ChartLevel, StockDetail, StockFact, StockListing, StockListings, StockSelection } from '../types';
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
function StockDetails({ stock, listing, exchangeControl, comparisonNotice, onRelated, strategy, events, levels, focusEventId, onSelectEvent, tradeContent }: { stock: StockSelection; listing?: StockListing; exchangeControl: ReactNode; comparisonNotice: ReactNode; onRelated: (stock: StockListing) => void } & ChartContextProps) {
  const detail = useStockResource<StockDetail>(`/stocks/${encodeURIComponent(stock.instrumentId)}`);
  const { quotes, status, error, now, liveBars } = useStockQuotes([stock.instrumentId], true, true);
  const quote = quotes[stock.instrumentId], data = detail.data, facts = new Map(data?.facts.map(fact => [fact.field, fact]) ?? []);
  const membership = data?.qualification, indices = facts.get('index')?.value ?? stock.metrics?.index;
  const source = membership?.source ?? stock.source;
  useEffect(() => { if (listing) useRecentStocks.getState().record(listing); }, [listing]);
  const qualificationContent=(
    <section className="stock-qualification-section" aria-label="Qualification context">
      <div className="stock-section-heading"><h3>Monthly qualification</h3>{source && <Tag color={source === 'manual' ? 'purple' : 'green'}>{source === 'manual' ? 'Manually added' : 'From monthly scan'}</Tag>}</div>
      {membership?.instrumentId && membership.instrumentId !== stock.instrumentId && <Alert type="info" showIcon title={`Qualification uses ${membership.exchange} ${membership.symbol ?? ''}.`} description={`You are viewing ${stock.instrument?.exchange} prices. ${membership.source === 'manual' ? 'Your manual addition' : 'The saved scan result'} and the listing used by your strategies remain tied to ${membership.exchange}.`} />}
      {detail.loading && !data ? <p className="muted">Loading qualification details…</p> : detail.error && !data ? <p className="muted">Qualification details are unavailable. Retry the company snapshot to load them.</p> : !source ? <p className="muted">This stock is not in the current published qualified list. You can research it and save it to a watchlist; watching it does not make it eligible for strategy entries.</p> : source === 'manual' ? <><p className="stock-manual-note">{membership?.note ?? stock.note ?? 'Added using your own qualification criteria.'}</p><p className="muted">Your custom addition. This stock is not marked as passing the monthly scan rules.</p></> : <>
        <p>Qualified in the published monthly scan{membership?.month ? ` for ${membership.month}` : ''}.</p>
        <p className="muted">{membership?.cutoff ? `Scan cutoff · ${stockTime(membership.cutoff)}. ` : ''}Current prices and updated company data do not change that saved result.</p>
        {membership?.rule && <Collapse ghost items={[{ key: 'rule', label: 'View qualification rules', children: <MonthlyRuleSummary rule={membership.rule} /> }]} />}
      </>}
    </section>
  );
  return <div className="stock-detail-content stock-monitoring-workspace">
    <div className="stock-exchange-toolbar"><StockQuickSwitch onSelect={onRelated}/>{exchangeControl}
      {listing && <Space size={8} wrap><WatchlistButton stock={listing}/><QualificationButton key={listing._id} stock={listing} onAdded={detail.retry}/></Space>}
    </div>
    {comparisonNotice}
    <StockMonitoringChart quickTradeContent={<QuickPaperTrade key={stock.instrumentId} instrumentId={stock.instrumentId} symbol={stock.instrument?.symbol ?? stock.instrumentId} quote={quote} now={now}/>} quoteContent={<section className="stock-quote-overview" aria-label="Stock quote">
      <div className="stock-quote-main"><StockPrice quote={quote} connected={isQuoteConnected(quote, status)} now={now} large /><div><StockChange quote={quote} /><span className="stock-change-context">vs previous close</span></div></div>
      <p className="stock-quote-timestamp">{quote ? `Last trade · ${stockTime(quote.lastTradeAt)}` : 'Waiting for a stock quote…'} <span>INR · {stock.instrument?.exchange}{quote ? ` · ${stockSource(quote)}` : ''}</span></p>
      <StockFeedStatus status={status} />
      {status.state !== 'streaming' && !status.marketClosed && (error || status.message) && <Alert type="warning" showIcon title={error || status.message} />}
    </section>} instrumentId={stock.instrumentId} symbol={stock.instrument?.symbol ?? data?.instrument.symbol ?? stock.instrumentId} quote={quote} liveBars={liveBars[stock.instrumentId]} now={now} strategy={strategy} events={events} levels={levels} focusEventId={focusEventId} onSelectEvent={onSelectEvent} tradeContent={tradeContent} qualificationContent={qualificationContent} relatedContent={<RelatedStocks instrumentId={stock.instrumentId} ready={!detail.loading} onSelect={onRelated}/>} overviewContent={<>
    <StockMarketDepth instrumentId={stock.instrumentId} now={now} quote={quote}/>
    <StockPerformance instrumentId={stock.instrumentId} quote={quote} now={now}/>
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
    </>}/>
  </div>;
}

export function StockDetailDrawer({ stock, onClose, onPrevious, onNext, ...context }: { stock?: StockSelection; onClose: () => void; onPrevious?: () => void; onNext?: () => void } & ChartContextProps) {
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<{ origin: string; listing: StockListing }>();
  const [research, setResearch] = useState<{ origin: string; stock: StockSelection }>();
  const selectedStock = research?.origin === stock?.instrumentId ? research?.stock ?? stock : stock;
  const researching = !!selectedStock && selectedStock.instrumentId !== stock?.instrumentId;
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.closest('.ant-drawer-body')?.scrollTo({ top: 0 }); }, [selectedStock?.instrumentId]);
  const listings = useStockResource<StockListings>(selectedStock ? `/stocks/${encodeURIComponent(selectedStock.instrumentId)}/listings` : null);
  useStockActionData(!!stock);
  const alternate = selection?.origin === selectedStock?.instrumentId ? selection?.listing : undefined;
  const listing = alternate ?? listings.data?.instrument;
  const viewed: StockSelection | undefined = selectedStock && (listing ? {
    ...(listing._id === selectedStock.instrumentId ? selectedStock : {}), instrumentId: listing._id, instrument: listing, isin: listing.isin,
  } : selectedStock);
  const comparingTrade = !!viewed && viewed.instrumentId !== stock?.instrumentId && !!(context.tradeContent || context.events?.length || context.levels?.length);
  const chartContext = researching ? {} : comparingTrade ? { strategy: context.strategy } : context;
  const originalExchange = stock?.instrument?.exchange ?? stock?.instrumentId.split(':')[0];
  const resetResearch = () => { setSelection(undefined); setResearch(undefined); };
  const close = () => { resetResearch(); onClose(); };
  return <Drawer open={!!stock} onClose={close} destroyOnHidden size={expanded ? '100vw' : 1120} className="stock-detail-drawer" title={<div className="stock-drawer-title"><strong>{viewed?.instrument?.symbol ?? viewed?.instrumentId}</strong><span>{viewed?.instrument?.name} · {viewed?.instrument?.exchange}</span></div>} extra={<Space size={4}>
    <Button aria-label="Previous stock" icon={<LeftOutlined />} disabled={!onPrevious || researching} onClick={() => { resetResearch(); onPrevious?.(); }} type="text" /><Button aria-label="Next stock" icon={<RightOutlined />} disabled={!onNext || researching} onClick={() => { resetResearch(); onNext?.(); }} type="text" />
    <Button aria-label={expanded ? 'Restore panel width' : 'Expand stock details'} icon={expanded ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setExpanded(x => !x)} type="text" />
  </Space>}>
    <div ref={contentRef}/>
    {stock && selectedStock && viewed && <StockDetails key={`${selectedStock.instrumentId}:${researching ? 'research' : context.strategy?._id ?? 'research'}`} stock={viewed} listing={listing} {...chartContext}
      onRelated={next => { setSelection(undefined); setResearch({ origin: stock.instrumentId, stock: { instrumentId: next._id, instrument: next, isin: next.isin } }); }}
      exchangeControl={<StockExchangeSwitch selectedId={viewed.instrumentId} exchange={viewed.instrument?.exchange ?? viewed.instrumentId.split(':')[0]} {...listings}
        onRetry={listings.retry} onSelect={next => setSelection({ origin: selectedStock.instrumentId, listing: next })} />}
      comparisonNotice={researching ? <div className="stock-exchange-context stock-related-return"><span>Exploring another stock</span><Button size="small" aria-label={`Back to ${stock.instrument?.symbol ?? stock.instrumentId}`} icon={<LeftOutlined/>} onClick={resetResearch}>Back to {stock.instrument?.symbol ?? stock.instrumentId}</Button></div> : comparingTrade && <div className="stock-exchange-context"><Alert type="info" showIcon title={`Comparing ${viewed.instrument?.exchange} prices`}
        description={`This paper trade belongs to ${originalExchange}. Its fills, stop-loss and targets are shown on that exchange's chart.`}
        action={<Button size="small" onClick={() => setSelection(undefined)}>Back to {originalExchange} trade</Button>}/></div>}
    />}
  </Drawer>;
}
