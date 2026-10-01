import { useState } from 'react';
import { Alert, App, Button, Empty, Input, Pagination, Segmented, Select, Skeleton, Tabs, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../services/apiClient';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import { StockDetailDrawer } from '../../stock-details/components/StockDetailDrawer';
import { Feed } from '../../stock-details/components/StockResearchFeed';
import type { StockSelection } from '../../stock-details/types';
import { eventLabels, type NewsCompany, type NewsMover, type NewsMovers, type NewsPage as NewsPageData, type NewsSources } from '../types';
import { NewsStoryCard } from '../components/NewsStoryCard';
import { relativeTime } from '../format';
import { useNow } from '../hooks';
import '../../../styles/news.css';

const PAGE = 30;
function Movers({ onOpen }: { onOpen: (stock: StockSelection) => void }) {
  const [days, setDays] = useState(7);
  const movers = useStockResource<NewsMovers>(`/news/movers?days=${days}`, 300_000);
  const list = (rows: NewsMover[], tone: 'positive' | 'negative') => !rows.length ? <p className="muted">Not enough coverage yet.</p> : <ol className="news-movers">{rows.map(row =>
    <li key={row.isin}><button type="button" onClick={() => onOpen({ instrumentId: row.instrumentId, isin: row.isin, instrument: { symbol: row.symbol, name: row.name, exchange: row.exchange } })}>
      <span><strong>{row.symbol}</strong><small>{row.stories} stories · {row.positive}↑ {row.negative}↓</small></span>
      <span className={`news-tone-${tone}`}>{row.score > 0 ? '+' : ''}{row.score}</span>
      <i className={`news-tone-bg-${tone}`} style={{ width: `${Math.min(100, Math.abs(row.score))}%` }} />
    </button></li>)}</ol>;
  return <aside className="news-side-card" aria-label="Sentiment movers">
    <div className="news-side-heading"><h3>Sentiment movers</h3><Segmented<number> size="small" value={days} onChange={v => setDays(v)} options={[{ label: '1D', value: 1 }, { label: '7D', value: 7 }, { label: '30D', value: 30 }]} /></div>
    {movers.loading && !movers.data ? <Skeleton active paragraph={{ rows: 6 }} /> : <>
      <h4 className="news-tone-positive">Most positive coverage</h4>{list(movers.data?.positive ?? [], 'positive')}
      <h4 className="news-tone-negative">Most negative coverage</h4>{list(movers.data?.negative ?? [], 'negative')}
    </>}
    <p className="muted">Companies with at least two stories, weighted by confidence. Research context, not a buy or sell signal.</p>
  </aside>;
}
function Coverage({ sources }: { sources?: NewsSources }) {
  return <aside className="news-side-card" aria-label="Sources">
    <div className="news-side-heading"><h3>Sources · last 24h</h3></div>
    <ul className="news-source-list">{(sources?.last24h ?? []).slice(0, 12).map(s => <li key={s._id}><span>{s._id}</span><span className="muted">{s.stories}</span></li>)}</ul>
    {sources?.lastRun?.failures.length ? <Alert type="warning" showIcon title="Some sources failed in the last run" description={sources.lastRun.failures.map(f => f.item).join(', ')} /> : null}
  </aside>;
}

function NewsFeed({ onOpen }: { onOpen: (stock: StockSelection) => void }) {
  const [scope, setScope] = useState<'all' | 'linked' | 'following'>('linked');
  const [sentiment, setSentiment] = useState<string>(), [kind, setKind] = useState<string | undefined>('important'), [eventType, setEventType] = useState<string>();
  const [days, setDays] = useState(3), [q, setQ] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const params = new URLSearchParams({ scope: scope === 'following' ? 'following' : 'all', days: String(days), page: String(page), pageSize: String(PAGE),
    ...(scope === 'linked' ? { linked: 'true' } : {}), ...(sentiment ? { sentiment } : {}), ...(kind ? { kind } : {}), ...(eventType ? { eventType } : {}), ...(search ? { q: search } : {}) });
  const feed = useStockResource<NewsPageData>(`/news?${params}`, 120_000);
  const reset = <T,>(set: (v: T) => void) => (value: T) => { set(value); setPage(1); };
  const openCompany = async (company: NewsCompany) => {
    const { data } = await apiClient.get<{ _id: string; symbol: string; name?: string; exchange: string; isin: string }[]>('/market-data/instruments', { params: { q: company.isin } });
    const listing = data.find(x => x.isin === company.isin);
    if (listing) onOpen({ instrumentId: listing._id, isin: listing.isin, instrument: { symbol: listing.symbol, name: listing.name, exchange: listing.exchange } });
  };
  const now = useNow();
  return <div className="news-feed">
    <div className="news-filters">
      <Segmented<typeof scope> value={scope} onChange={v => reset(setScope)(v)} options={[{ label: 'About listed companies', value: 'linked' }, { label: 'My stocks', value: 'following' }, { label: 'Everything', value: 'all' }]} />
      <Select allowClear placeholder="Any sentiment" value={sentiment} onChange={reset(setSentiment)} style={{ width: 150 }} options={[{ value: 'positive', label: 'Positive' }, { value: 'negative', label: 'Negative' }, { value: 'neutral', label: 'Neutral' }]} />
      <Select allowClear placeholder="Everything incl. routine filings" value={kind} onChange={reset(setKind)} style={{ width: 190 }} options={[{ value: 'important', label: 'Media & key filings' }, { value: 'news', label: 'Media news only' }, { value: 'filing', label: 'All NSE filings' }]} />
      <Select allowClear placeholder="Any event type" value={eventType} onChange={reset(setEventType)} style={{ width: 170 }} options={Object.entries(eventLabels).map(([value, label]) => ({ value, label }))} />
      <Select value={days} onChange={reset(setDays)} style={{ width: 120 }} options={[{ value: 1, label: 'Last 24h' }, { value: 3, label: 'Last 3 days' }, { value: 7, label: 'Last 7 days' }, { value: 30, label: 'Last 30 days' }]} />
      <Input.Search allowClear placeholder="Search headlines or symbol" value={q} onChange={e => setQ(e.target.value)} onSearch={value => { setSearch(value.trim()); setPage(1); }} style={{ width: 240 }} />
    </div>
    {scope === 'following' && <p className="muted news-scope-note">Stories about companies in your published qualified list and watchlists.</p>}
    {feed.error && <Alert type="warning" showIcon title="News could not be loaded" description={feed.error} action={<Button onClick={feed.retry}>Retry</Button>} />}
    {feed.loading && !feed.data ? <Skeleton active paragraph={{ rows: 10 }} /> : !feed.data?.items.length ? <Empty description="No stories match these filters yet." />
      : <div className="news-list">{feed.data.items.map(story => <NewsStoryCard key={story._id} story={story} now={now} onOpen={company => { void openCompany(company); }} />)}</div>}
    {(feed.data?.total ?? 0) > PAGE && <Pagination current={page} pageSize={PAGE} total={feed.data!.total} showSizeChanger={false} onChange={setPage} showTotal={n => `${n.toLocaleString('en-IN')} stories`} />}
  </div>;
}

export default function NewsPage() {
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'events' ? 'events' : 'news';
  const [selected, setSelected] = useState<StockSelection>();
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');
  const sources = useStockResource<NewsSources>('/news/sources', 120_000);
  const lastRun = sources.data?.lastRun;
  async function refresh() {
    try { await apiClient.post('/news/refresh'); message.info('Collecting the latest headlines. New stories appear within a few minutes.'); }
    catch (error) { message.error((error as Error).message); }
  }
  return <div className="page-enter news-page">
    <div className="workspace-page-heading"><div><span className="indices-eyebrow">MARKET DATA</span><h1>News & events</h1>
      <p>Business news and exchange filings, linked to stocks and scored positive or negative. Use the same scores in qualification rules.</p></div>
      <div className="news-heading-actions">{lastRun && <Tooltip title={`Sources: ${sources.data?.sources.join(', ')}`}><span className="muted">Collected {relativeTime(lastRun.finishedAt ?? lastRun.startedAt)} · every 30 min</span></Tooltip>}
        <Button icon={<ReloadOutlined />} onClick={() => { void refresh(); }}>Collect now</Button></div></div>
    <Tabs activeKey={tab} onChange={key => setParams(key === 'news' ? {} : { tab: key })} items={[
      { key: 'news', label: 'News', children: <div className="news-layout"><NewsFeed onOpen={setSelected} /><div className="news-side"><Movers onOpen={setSelected} /><Coverage sources={sources.data} /></div></div> },
      { key: 'events', label: 'Events calendar', children: <div className="news-events">
        <Segmented<'NSE' | 'BSE'> value={exchange} onChange={v => setExchange(v)} options={['NSE', 'BSE']} />
        <Feed key={exchange} kind="events" market path={`/news/events?exchange=${exchange}`} />
      </div> },
    ]} />
    <StockDetailDrawer stock={selected} onClose={() => setSelected(undefined)} />
  </div>;
}
