import '../../../styles/news.css';
import { useState } from 'react';
import { Alert, Button, Empty, Segmented, Skeleton, Tooltip } from 'antd';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import type { StockNews } from '../types';
import { NewsStoryCard } from './NewsStoryCard';
import { useNow } from '../hooks';

function Gauge({ label, value, help }: { label: string; value: number | null; help: string }) {
  const tone = value === null ? 'neutral' : value >= 20 ? 'positive' : value <= -20 ? 'negative' : 'neutral';
  return <Tooltip title={help}><div className="news-gauge">
    <span>{label}</span><strong className={`news-tone-${tone}`}>{value === null ? '—' : `${value > 0 ? '+' : ''}${value}`}</strong>
    <div className="news-gauge-track" aria-hidden>{value !== null && <i className={`news-tone-bg-${tone}`} style={{ left: value >= 0 ? '50%' : `${50 + value / 2}%`, width: `${Math.abs(value) / 2}%` }} />}</div>
  </div></Tooltip>;
}
/** Media coverage for one company: sentiment summary and its latest stories. */
export function StockNewsCoverage({ instrumentId }: { instrumentId: string }) {
  const [refresh, setRefresh] = useState(0);
  const resource = useStockResource<StockNews>(`/news/stock/${encodeURIComponent(instrumentId)}${refresh ? `?refresh=true&r=${refresh}` : ''}`);
  const [filter, setFilter] = useState<'all' | 'news' | 'positive' | 'negative'>('all');
  const data = resource.data, now = useNow();
  const items = (data?.items ?? []).filter(x => filter === 'all' || (filter === 'news' ? x.kind === 'news' : x.sentiment.label === filter));
  return <section className="news-coverage" aria-label="News coverage">
    <div className="stock-section-heading"><div><h3>Media coverage & sentiment</h3><p className="muted">Business news and exchange filings about this company, scored for likely impact</p></div>
      <Button size="small" loading={resource.loading} onClick={() => setRefresh(Date.now())}>Search again</Button></div>
    {(resource.error || data?.message) && <Alert type="warning" showIcon title={resource.error ?? data?.message} />}
    {resource.loading && !data ? <Skeleton active paragraph={{ rows: 3 }} /> : data && <>
      <div className="news-summary-row">
        <Gauge label="Sentiment · 7 days" value={data.summary.newsSentiment7d} help="Confidence- and recency-weighted impact of stories in the last 7 days, −100 to +100." />
        <Gauge label="Sentiment · 30 days" value={data.summary.newsSentiment30d} help="The same score over 30 days with a slower decay." />
        <div className="news-gauge"><span>Mood · 7 days</span><strong className={`news-tone-${data.summary.newsMood7d.toLowerCase()}`}>{data.summary.newsMood7d}</strong><small>{data.summary.newsCount7d} stories</small></div>
        <div className="news-gauge"><span>30 days</span><strong><span className="news-tone-positive">{data.summary.newsPositive30d} positive</span> · <span className="news-tone-negative">{data.summary.newsNegative30d} negative</span></strong></div>
      </div>
      <Segmented<typeof filter> size="small" value={filter} onChange={value => setFilter(value)} options={[{ label: 'All', value: 'all' }, { label: 'Media only', value: 'news' }, { label: 'Positive', value: 'positive' }, { label: 'Negative', value: 'negative' }]} />
      {!items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.items.length ? 'No stories match this filter.' : 'No stories about this company in the last 30 days.'} />
        : <div className="news-list news-list-compact">{items.slice(0, 25).map(story => <NewsStoryCard key={story._id} story={story} hideCompanies now={now} />)}</div>}
      <p className="stock-chart-note">Headlines from CNBC-TV18, Economic Times, Business Standard, Mint, BusinessLine, NDTV Profit and Google News, plus NSE filings. Scores estimate likely impact from the headline; they are research context, not buy or sell signals.</p>
    </>}
  </section>;
}
