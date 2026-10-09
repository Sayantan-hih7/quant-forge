import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Input, Select, Space, Table, Tabs, Tag } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import { useStockQuotes } from '../../stock-details/hooks/useStockQuotes';
import { StockPrice, StockChange } from '../../stock-details/components/StockPrice';
import { StockFeedStatus } from '../../stock-details/components/StockFeedStatus';
import { StockDetailDrawer } from '../../stock-details/components/StockDetailDrawer';
import { RecentlyViewedStocks } from '../../stock-details/components/RecentlyViewedStocks';
import type { StockSelection } from '../../stock-details/types';
import { isQuoteConnected } from '../../stock-details/utils/format';
import { qualifiedMember, useStockActionData, useStockActions } from '../hooks/useStockActions';
import { WatchlistButton } from '../components/WatchlistButton';
import { QualificationButton } from '../../qualification/components/QualificationButton';
import type { BrowseStock, BrowseStocks } from '../types';
import type { TableColumnsType } from 'antd';
import { useDiscovery } from '../../stock-discovery/hooks/useDiscovery';
import { DiscoveryGroups } from '../../stock-discovery/components/DiscoveryGroups';
import { DiscoveryMatch } from '../../stock-discovery/components/DiscoveryMatch';
import '../../../styles/watchlists.css';
import '../../../styles/stock-details.css';

export default function WatchlistsPage() {
  const [params, setParams] = useSearchParams();
  const watching = params.get('tab') === 'watchlist' || !!params.get('list');
  const groupId = !watching ? params.get('group') || undefined : undefined;
  useStockActionData();
  const { watchlists, membership, error, refresh } = useStockActions();
  const list = watchlists?.lists[0];
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [exchange, setExchange] = useState<string>();
  const [pagination, setPagination] = useState({ key: '', page: 1, size: 20 });
  const [sorting, setSort] = useState({ context: '', field: 'symbol', order: 'asc' });
  const sortContext = watching ? 'watchlist' : groupId ?? 'all';
  const sort = sorting.context === sortContext ? sorting : { field: groupId ? 'rank' : 'symbol', order: 'asc' };
  const discovery = useDiscovery(!watching, exchange);
  const group = discovery.data?.groups?.find(item => item.id === groupId);
  const [selected, setSelected] = useState<StockSelection>();
  const openStock = (row: BrowseStock) => setSelected({ instrumentId: row._id, instrument: row, isin: row.isin });
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const key = JSON.stringify([watching, groupId, search, exchange, sort]);
  const page = pagination.key === key ? pagination.page : 1;
  const request = new URLSearchParams({ q: search, page: String(page), pageSize: String(pagination.size), sort: sort.field, order: sort.order });
  if (watching) request.set('listId', 'personal');
  if (exchange) request.set('exchange', exchange);
  if (watching && list) request.set('updatedAt', list.updatedAt);
  if (groupId) { request.set('group', groupId); if (discovery.data?.version) request.set('version', discovery.data.version); }
  const stocks = useStockResource<BrowseStocks>(`${groupId ? '/stock-discovery/stocks' : '/watchlists/stocks'}?${request}`);
  const rows = stocks.data?.items ?? [];
  const { quotes, status, now, error: quoteError } = useStockQuotes(rows.filter(row => row.active).map(row => row._id));
  const selectedIndex = rows.findIndex(row => row._id === selected?.instrumentId);
  function choose(tab: string) { setSelected(undefined); setParams(tab === 'watchlist' ? { tab } : {}); }
  function chooseGroup(id?: string) { setSelected(undefined); setParams(id ? { group: id } : {}); }
  const matchColumns: TableColumnsType<BrowseStock> = groupId ? [{ title: 'Group match', width: 180, render: (_, row) => row.discovery && <DiscoveryMatch data={row.discovery} rankBy={group?.rankBy} symbol={row.symbol} /> }] : [];
  function quoteFor(row: BrowseStock) {
    const current = quotes[row._id], snapshot = row.discovery?.quote;
    return snapshot && (!current || (snapshot.lastTradeAt ?? '') >= (current.lastTradeAt ?? '')) ? snapshot : current;
  }
  return <div className="watchlists-page">
    <div className="workspace-page-heading"><div><span className="indices-eyebrow">MARKET DATA</span><h1>Stocks & watchlist</h1><p>Find any stock. Star it to follow, or add it to your monthly qualified list.</p></div><Link to="/qualification?tab=universe">View qualified stocks →</Link></div>
    <RecentlyViewedStocks onSelect={setSelected}/>
    {error && <RequestFeedback type="warning" showIcon title="Stock actions unavailable" description={error} action={<Button onClick={() => void refresh()}>Retry</Button>} />}
    <section className="watchlists-content" aria-label="Stock browser">
      <Tabs activeKey={watching ? 'watchlist' : 'all'} onChange={choose} items={[
        { key: 'all', label: `All stocks${watchlists ? ` (${watchlists.universeCount.toLocaleString()})` : ''}` },
        { key: 'watchlist', label: `Watchlist${list ? ` (${list.ids.length})` : ''}` },
      ]} tabBarExtraContent={<Button icon={<ReloadOutlined />} aria-label="Refresh stock list" onClick={() => { stocks.retry(); void refresh(); if (!watching) discovery.retry(); }} />} />
      {!watching && <DiscoveryGroups data={discovery.data} error={discovery.error} selected={groupId} onSelect={chooseGroup} onRefresh={discovery.retry} />}
      <div className="watchlists-toolbar"><Input aria-label="Search stock universe" prefix={<SearchOutlined />} allowClear placeholder={groupId ? `Search within ${group?.name ?? 'this group'}` : 'Symbol, company or ISIN'} value={query} onChange={e => setQuery(e.target.value)} /><Select aria-label="Stock exchange" allowClear placeholder="All exchanges" value={exchange} onChange={setExchange} options={['NSE', 'BSE'].map(value => ({ value, label: value }))} />{groupId && sort.field !== 'rank' && <Button size="small" onClick={() => setSort({ context: sortContext, field: 'rank', order: 'asc' })}>Restore group ranking</Button>}<StockFeedStatus status={status} /></div>
      {stocks.error && <RequestFeedback type="warning" showIcon title={stocks.error} action={<Button onClick={stocks.retry}>Retry</Button>} />}
      {quoteError && !status.marketClosed && status.state !== 'streaming' && <Alert type="warning" showIcon title={quoteError} />}
      <Table<BrowseStock> size="small" rowKey="_id" loading={stocks.loading} dataSource={rows} scroll={{ x: 960 }}
        pagination={{ current: stocks.data?.page ?? page, pageSize: pagination.size, total: stocks.data?.total ?? 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total, range) => `${total ? range[0] : 0}–${range[1]} of ${total.toLocaleString()} stocks` }}
        onChange={(p, _filters, sorter, extra) => { if (extra.action === 'sort') { const s = Array.isArray(sorter) ? sorter[0] : sorter; setSort({ context: sortContext, field: s.order ? String(s.columnKey) : groupId ? 'rank' : 'symbol', order: s.order === 'descend' ? 'desc' : 'asc' }); } else setPagination({ key, page: p.pageSize !== pagination.size ? 1 : p.current ?? 1, size: p.pageSize ?? 20 }); }}
        locale={{ emptyText: <Empty description={groupId ? discovery.data?.refreshing && !group?.coverage.available ? 'Preparing the market snapshot…' : !group?.coverage.available ? 'Required data is not available for this group yet' : search ? 'No stocks in this group match your search' : 'No stocks currently match all group rules' : search || exchange ? 'No stocks match these filters' : watching ? 'Star a stock to start your watchlist' : 'Import the stock universe in Connections & Data'}>{groupId ? <Button onClick={() => chooseGroup()}>Show all stocks</Button> : watching && !search && !exchange && <Button onClick={() => choose('all')}>Browse all stocks</Button>}</Empty> }}
        columns={[
          { title: 'Watch', width: 62, render: (_, row) => <WatchlistButton stock={row} onChanged={watching ? stocks.retry : undefined} /> },
          { title: 'Stock', key: 'symbol', sorter: true, sortOrder: sort.field === 'symbol' ? sort.order === 'asc' ? 'ascend' : 'descend' : null, width: 240, render: (_, row) => <><button className="stock-symbol-button" onClick={() => openStock(row)}>{row.symbol}</button><div className="muted stock-list-name">{row.name}</div>{!row.active && <Tag>Inactive listing</Tag>}</> },
          { title: 'Exchange', key: 'exchange', sorter: true, sortOrder: sort.field === 'exchange' ? sort.order === 'asc' ? 'ascend' : 'descend' : null, width: 95, dataIndex: 'exchange' },
          ...matchColumns,
          { title: 'Last price', align: 'right', width: 145, render: (_, row) => <StockPrice quote={quoteFor(row)} connected={isQuoteConnected(quoteFor(row), status)} now={now} /> },
          { title: 'Day change', align: 'right', width: 140, render: (_, row) => <StockChange quote={quoteFor(row)} /> },
          { title: 'Qualification', width: 235, render: (_, row) => <Space orientation="vertical" size={4}><QualificationButton stock={row} />{qualifiedMember(row, membership)?.source === 'manual' && <Tag color="purple">Manually added</Tag>}</Space> },
        ]} />
      <p className="watchlists-footnote">Stars only save stocks for you to follow. They do not qualify stocks or place orders. Quotes update for the visible page during market hours.</p>
    </section>
    <StockDetailDrawer stock={selected} onClose={() => setSelected(undefined)} onPrevious={selectedIndex > 0 ? () => openStock(rows[selectedIndex - 1]) : undefined} onNext={selectedIndex >= 0 && selectedIndex < rows.length - 1 ? () => openStock(rows[selectedIndex + 1]) : undefined} />
  </div>;
}
