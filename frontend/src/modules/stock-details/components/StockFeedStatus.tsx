import { Tag, Tooltip } from 'antd';
import type { QuoteStatus } from '../types';

export function StockFeedStatus({ status }: { status: QuoteStatus }) {
  const connected = status.state === 'streaming' && !status.marketClosed;
  const providers = status.providers?.map(p => p === 'motilal' ? 'Motilal' : 'Dhan').join(' + ');
  return <Tooltip title={status.message ?? 'Feed connection and last-trade freshness are shown separately. A connected stock only updates when a new trade arrives.'}>
    <Tag color={connected ? 'green' : status.marketClosed ? undefined : 'orange'}>{status.marketClosed ? 'Market closed' : connected ? `Feed connected${providers ? ` · ${providers}` : ''}` : status.state === 'unavailable' ? 'Live feed unavailable' : 'Connecting live prices'}</Tag>
  </Tooltip>;
}
