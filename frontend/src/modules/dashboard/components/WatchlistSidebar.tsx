import { Button, Empty, Input } from 'antd';
import { SearchOutlined, SettingOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MonthlyCache, QualificationWorkspace } from '../../qualification/types';
import type { StockOpportunity } from '../types/opportunities';
import { formatPrice } from '../utils/stockOpportunities';

export function WatchlistSidebar({ workspace, cache, opportunities, selectedLayerId, onSelectLayer }: {
  workspace: QualificationWorkspace; cache?: MonthlyCache; opportunities: StockOpportunity[]; selectedLayerId: string; onSelectLayer: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const symbols = new Set(opportunities.filter(row => row.layerId === selectedLayerId).map(row => row.symbol));
  const stocks = (cache?.candidates ?? []).filter((stock) => (selectedLayerId === 'all' || symbols.has(stock.symbol)) && `${stock.symbol} ${stock.name}`.toLowerCase().includes(search.toLowerCase()));
  return <aside className="opportunity-watchlists" aria-label="Dashboard watchlists">
    <header><h3><UnorderedListOutlined /> Qualified watchlists</h3><Button size="small" type="text" aria-label="Open qualified universe" icon={<SettingOutlined />} onClick={() => navigate('/qualification')} /></header>
    <div className="watchlist-base-select"><span>MONTHLY BASE · {cache?.month ?? 'PENDING'}</span><strong>{cache?.rule.name ?? 'No current cache'}</strong></div>
    <div className="watchlist-categories">
      <button className={selectedLayerId === 'all' ? 'selected' : ''} onClick={() => onSelectLayer('all')} aria-pressed={selectedLayerId === 'all'}>Monthly universe <span>{cache?.candidates.length ?? 0}</span></button>
      {workspace.templates.filter((rule) => rule.tier === 'tactical' && rule.side === 'BUY').map((rule) => {
        const count = opportunities.filter(row => row.layerId === rule.id).length;
        return <button key={rule.id} className={selectedLayerId === rule.id ? 'selected' : ''} onClick={() => onSelectLayer(rule.id)} aria-pressed={selectedLayerId === rule.id} aria-label={`Select watchlist ${workspace.tradingPlans?.find(plan => plan.entryRuleId === rule.id)?.name ?? rule.name}`}><span>{workspace.tradingPlans?.find(plan => plan.entryRuleId === rule.id)?.name ?? rule.name}<small>{count ? 'Ready buy alerts' : 'Awaiting fresh signals'}</small></span><span>{count}</span></button>;
      })}
    </div>
    <Input aria-label="Search watchlist stocks" placeholder="Search watchlist" value={search} prefix={<SearchOutlined />} onChange={(event) => setSearch(event.target.value)} allowClear />
    <div className="watchlist-stock-list">{stocks.map((stock) => <div key={stock.symbol}><span><strong>{stock.symbol}</strong><small>{stock.name}</small></span><span>{formatPrice(stock.close)}</span></div>)}{!stocks.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No stocks in this view" />}</div>
    <footer>{stocks.length} stocks · Synthetic prices</footer>
  </aside>;
}
