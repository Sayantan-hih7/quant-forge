import { Button, Radio, Space, Tooltip } from 'antd';
import type { StockListing, StockListings } from '../types';

export function StockExchangeSwitch({ selectedId, exchange, data, loading, error, onRetry, onSelect }: {
  selectedId: string; exchange: string; data?: StockListings; loading: boolean; error?: string;
  onRetry: () => void; onSelect: (listing: StockListing) => void;
}) {
  return <div className="stock-exchange-switch">
    <Space size={12} wrap><span className="muted">Exchange</span>
      <Radio.Group aria-label="Stock exchange" value={exchange} optionType="button" buttonStyle="solid"
        onChange={event => { const listing = data?.listings.find(row => row.exchange === event.target.value); if (listing) onSelect(listing); }}>
        {(['NSE', 'BSE'] as const).map(value => {
          const listing = data?.listings.find(row => row.exchange === value);
          const isCurrent = value === exchange;
          const title = loading ? 'Checking exchange listings…' : error ? 'Exchange listings could not be loaded.'
            : !listing ? `No active ${value} listing available.` : `View ${listing.symbol} on ${value}`;
          return <Tooltip key={value} title={title}><Radio.Button value={value} disabled={!isCurrent && !listing || listing?._id !== selectedId && loading}>{value}</Radio.Button></Tooltip>;
        })}
      </Radio.Group>
    </Space>
    {error ? <span className="stock-exchange-note">Could not check other listings. <Button type="link" size="small" onClick={onRetry}>Retry exchanges</Button></span>
      : <span className="stock-exchange-note">{loading ? 'Checking available listings…' : data?.listings.length === 2 ? 'Same stock · exchange-specific prices and volume' : data?.listings.length === 0 ? 'No active listing · viewing saved history' : `Only ${data?.listings[0]?.exchange ?? exchange} is available for this stock`}</span>}
  </div>;
}
