import { useEffect, useState } from 'react';
import { TrendChart, type TrendPoint } from '../../../components/charts/TrendChart';
import { apiClient } from '../../../services/apiClient';
import { directionOf, indexNumber, indexTime } from '../utils/indices';
import type { IndexQuote } from '../types/indices';

interface ChartData { points: TrendPoint[]; chartKind: IndexQuote['chartKind']; warning?: string }
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });

export function IndexSparkline({ quote, expanded = false }: { quote: IndexQuote; expanded?: boolean }) {
  const [download, setDownload] = useState<{ id: string; data: ChartData }>();
  useEffect(() => {
    if (!expanded || quote.exchange !== 'BSE' || quote.status === 'eod') return;
    let active = true;
    void apiClient.get<ChartData>('/market-indices/chart', { params: { id: quote.id } })
      .then(({ data }) => { if (active) setDownload({ id: quote.id, data }); }).catch(() => {});
    return () => { active = false; };
  }, [expanded, quote.id, quote.exchange, quote.status, quote.fetchedAt]);
  const downloaded = download?.id === quote.id ? download.data : undefined;
  const sameDate = downloaded?.points.length && quote.asOf && new Date(downloaded.points.at(-1)!.time).toISOString().slice(0,10) === quote.asOf.slice(0,10);
  const data = sameDate ? downloaded.points : quote.points ?? [];
  const kind = sameDate ? downloaded.chartKind : quote.chartKind;
  const description = kind === 'daily' ? 'Daily closes' : kind === 'intraday' ? 'Intraday' : 'Collected snapshots';
  const direction = directionOf(quote.change);
  if (data.length < 2) return <div className={`index-sparkline index-data-empty${expanded ? ' expanded' : ''}`}>
    {expanded ? 'The chart needs at least two reported values. Snapshots are collected while this page is open.' : 'Collecting points'}
  </div>;
  return <div className={`index-sparkline${expanded ? ' expanded' : ''}`} title={`${description} · through ${indexTime(new Date(data.at(-1)!.time).toISOString())}`}>
    <TrendChart data={data} baseline={kind === 'daily' ? undefined : quote.previousClose ?? undefined}
      tone={direction === 'up' ? 'positive' : direction === 'down' ? 'negative' : 'neutral'}
      label={`${quote.name}: ${description.toLowerCase()}, ${data.length} reported values.`}
      expanded={expanded} formatValue={indexNumber}
      formatTime={time => (kind === 'daily' ? dateFormat : timeFormat).format(time)} />
    {expanded && <small className="index-chart-caption">{description} · {indexTime(new Date(data[0].time).toISOString())} – {indexTime(new Date(data.at(-1)!.time).toISOString())}{downloaded?.warning ? ` · ${downloaded.warning}` : ''}</small>}
  </div>;
}
