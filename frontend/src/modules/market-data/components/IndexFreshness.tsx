import { Tag, Tooltip } from 'antd';
import type { IndexQuote } from '../types/indices';
import { indexTime } from '../utils/indices';

export function IndexFreshness({ quote, compact = false }: { quote: IndexQuote; compact?: boolean }) {
  const label = quote.status === 'snapshot' ? 'Snapshot' : quote.status === 'eod' ? 'Daily close' : quote.status === 'stale' ? 'Last saved' : 'Unavailable';
  return <Tooltip title={`${quote.source ?? 'Awaiting exchange data'} · As of ${indexTime(quote.asOf)}${quote.fetchedAt ? ` · Retrieved ${indexTime(quote.fetchedAt)}` : ''}`}>
    <span className="index-freshness">
      <Tag color={quote.status === 'snapshot' ? 'blue' : quote.status === 'stale' ? 'orange' : undefined}>{label}</Tag>
      {!compact && <span>{indexTime(quote.asOf)}</span>}
    </span>
  </Tooltip>;
}
