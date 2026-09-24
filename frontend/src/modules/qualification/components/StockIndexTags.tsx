import { Popover, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { stockIndexLabel } from '../config/stockIndices';
import { useIndexQuotes } from '../../market-data/hooks/useIndexQuotes';
import { IndexQuickView } from '../../market-data/components/IndexQuickView';
import { indexDetailsPath } from '../../market-data/utils/indexLinks';
import { formatMonth } from '../../strategies/utils/monthlyCycle';
import '../../../styles/stock-indices.css';

export function StockIndexTags({ indices, membershipMonth, labels = {} }: { indices: string[]; membershipMonth?: string; labels?: Record<string, string> }) {
  const { quotes } = useIndexQuotes();
  const quoteById = new Map(quotes.map(quote => [quote.id, quote]));
  if (!indices.length) return <span className="q-index-empty">No tracked index</span>;
  return <div className="q-index-tags" aria-label="Index memberships">
    {indices.map((id) => {
      const quote = quoteById.get(`${id.startsWith('bse-') ? 'bse' : 'nse'}:${id}`) ?? quotes.find(item => item.name.toLowerCase() === labels[id]?.toLowerCase());
      const label = labels[id] ?? stockIndexLabel(id);
      if (!quote) return <Tag key={id}>{label}</Tag>;
      return <Popover key={id} trigger={['hover', 'focus']} placement="topLeft" mouseEnterDelay={0.15} content={<IndexQuickView quote={quote} membershipLabel={membershipMonth ? formatMonth(membershipMonth) : undefined} />}>
        <Link className="q-index-link" to={indexDetailsPath(quote)} aria-label={`View ${quote.name} index`}><Tag>{label}</Tag></Link>
      </Popover>;
    })}
  </div>;
}
