import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { HistoryOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useRecentStocks } from '../store/recentStocks';
import type { StockSelection } from '../types';

export function RecentlyViewedStocks({ onSelect }: { onSelect: (stock: StockSelection) => void }) {
  const { items, clear } = useRecentStocks();
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  return <section className="recent-stocks" aria-label="Recently viewed stocks">
    <div className="stock-links-heading"><div><h2><HistoryOutlined /> Recently viewed</h2><p>Pick up where you left off · Saved on this browser</p></div><div>
      {items.length > 4 && <Button type="text" size="small" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `Show all (${items.length})`}</Button>}
      <Button type="text" size="small" onClick={clear}>Clear history</Button>
    </div></div>
    <div className="recent-stock-grid">{(expanded ? items : items.slice(0, 4)).map(stock => <Tooltip key={stock._id} title={`Viewed ${new Date(stock.viewedAt).toLocaleString('en-IN')}`}>
      <button className="stock-research-link" onClick={() => onSelect({ instrumentId: stock._id, instrument: stock, isin: stock.isin })} aria-label={`Reopen ${stock.symbol} on ${stock.exchange}`}>
        <span className="stock-link-symbol"><strong>{stock.symbol}</strong><small>{stock.exchange}</small><ArrowRightOutlined /></span>
        <span className="stock-link-name">{stock.name || stock.symbol}</span>
      </button>
    </Tooltip>)}</div>
  </section>;
}
