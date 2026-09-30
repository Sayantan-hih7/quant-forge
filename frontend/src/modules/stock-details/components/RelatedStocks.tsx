import { Alert, Button, Skeleton, Tooltip } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useStockResource } from '../hooks/useStockResource';
import { stockNumber } from '../utils/format';
import type { StockListing } from '../types';

interface RelatedData {
  sector: string | null; sectorObservedAt: string | null; message: string | null;
  ordering: 'alphabetical' | 'similar-market-cap'; checkedAt: string;
  items: (StockListing & { marketCap: number | null; marketCapObservedAt: string | null })[];
}
export function RelatedStocks({ instrumentId, ready, onSelect }: { instrumentId: string; ready: boolean; onSelect: (stock: StockListing) => void }) {
  const resource = useStockResource<RelatedData>(ready ? `/stocks/${encodeURIComponent(instrumentId)}/related` : null);
  const data = resource.data;
  return <section className="stock-related-section" aria-label="Related stocks">
    <div className="stock-links-heading"><div><h3>Related stocks</h3><p>{data?.sector ? `Same sector · ${data.sector}` : 'Explore companies in the same sector'}</p></div></div>
    {resource.error ? <Alert type="warning" showIcon title="Related stocks unavailable" description={resource.error} action={<Button onClick={resource.retry}>Retry</Button>} />
      : !ready || resource.loading ? <Skeleton active paragraph={{ rows: 2 }} />
      : !data?.items?.length ? <p className="muted">{data?.message ?? 'No related companies with matching sector data are available yet.'}</p>
      : <><div className="related-stock-grid">{data.items.map(stock => <button key={stock._id} className="stock-research-link" onClick={() => onSelect(stock)} aria-label={`View related stock ${stock.symbol} on ${stock.exchange}`}>
        <span className="stock-link-symbol"><strong>{stock.symbol}</strong><small>{stock.exchange}</small><ArrowRightOutlined /></span>
        <span className="stock-link-name">{stock.name || stock.symbol}</span>
        <Tooltip title={stock.marketCapObservedAt ? `Market cap observed ${new Date(stock.marketCapObservedAt).toLocaleDateString('en-IN')}` : 'Market cap is not available'}><span className="stock-link-cap">{stock.marketCap === null ? 'Market cap unavailable' : `Market cap ₹${stockNumber(stock.marketCap)} Cr`}</span></Tooltip>
      </button>)}</div>
        <p className="stock-chart-note">{data.ordering === 'similar-market-cap' ? 'Companies with a similar saved market cap appear first; missing values follow alphabetically.' : 'Listed alphabetically using available sector data.'} Same exchange, one listing per company. These are research links, not buy or sell signals.</p></>}
  </section>;
}
