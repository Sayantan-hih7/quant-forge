import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Dropdown, Empty, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, SearchOutlined, StarOutlined, ReloadOutlined, EditOutlined } from '@ant-design/icons';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import { useStockQuotes } from '../../stock-details/hooks/useStockQuotes';
import { StockPrice, StockChange } from '../../stock-details/components/StockPrice';
import { StockFeedStatus } from '../../stock-details/components/StockFeedStatus';
import { StockDetailDrawer } from '../../stock-details/components/StockDetailDrawer';
import { isQuoteConnected } from '../../stock-details/utils/format';
import { apiClient } from '../../../services/apiClient';
import { WatchlistNameModal } from '../components/WatchlistNameModal';
import type { BrowseStock, BrowseStocks, Watchlist, WatchlistState } from '../types';
import '../../../styles/watchlists.css';
import '../../../styles/stock-details.css';

export default function WatchlistsPage() {
  const [params, setParams] = useSearchParams(), listId = params.get('list') ?? '';
  const lists = useStockResource<WatchlistState>('/watchlists');
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [exchange, setExchange] = useState<string>();
  const [pagination, setPagination] = useState({ key: '', page: 1, size: 20 });
  const [sort, setSort] = useState({ field: 'symbol', order: 'asc' });
  const [dialog, setDialog] = useState<{ list?: Watchlist; stock?: BrowseStock }>();
  const [selected, setSelected] = useState<BrowseStock>(), [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const key = JSON.stringify([listId, search, exchange, sort]);
  const page = pagination.key === key ? pagination.page : 1;
  const request = new URLSearchParams({ q: search, page: String(page), pageSize: String(pagination.size), sort: sort.field, order: sort.order });
  if (listId) request.set('listId', listId);
  if (exchange) request.set('exchange', exchange);
  const stocks = useStockResource<BrowseStocks>(`/watchlists/stocks?${request}`);
  const rows = stocks.data?.items ?? [], current = lists.data?.lists.find(list => list._id === listId);
  const { quotes, status, now, error: quoteError } = useStockQuotes(rows.filter(row => row.active).map(row => row._id));
  const selectedIndex = rows.findIndex(row => row._id === selected?._id);
  function choose(id: string) { setSelected(undefined); setQuery(''); setSearch(''); setExchange(undefined); setParams(id ? { list: id } : {}); }
  async function add(stock: BrowseStock, id: string) {
    setBusy(true);
    try { await apiClient.post(`/watchlists/${id}/stocks`, { instrumentId: stock._id }); lists.retry(); if (id === listId) stocks.retry(); message.success(`${stock.symbol} saved to watchlist`); }
    catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  async function remove(stock: BrowseStock) {
    setBusy(true);
    try { await apiClient.delete(`/watchlists/${listId}/stocks/${encodeURIComponent(stock._id)}`); lists.retry(); stocks.retry(); }
    catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  async function deleteList() {
    setBusy(true);
    try { await apiClient.delete(`/watchlists/${listId}`); choose(''); lists.retry(); }
    catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  return <div className="watchlists-page">
    <div className="workspace-page-heading"><div><span className="indices-eyebrow">MARKET DATA</span><h1>Stocks & watchlists</h1><p>Explore the full stock universe. Keep the stocks you want to follow in your own lists.</p></div><Button type="primary" icon={<PlusOutlined />} onClick={() => setDialog({})}>New watchlist</Button></div>
    {lists.error && <Alert type="warning" showIcon title={lists.error} action={<Button onClick={lists.retry}>Retry</Button>} />}
    <div className="watchlists-layout">
      <aside className="watchlists-sidebar" aria-label="Watchlists"><button className={!listId ? 'active' : ''} onClick={() => choose('')}><span>All stocks</span><b>{lists.data?.universeCount.toLocaleString() ?? '—'}</b></button><div className="watchlists-label">YOUR WATCHLISTS</div>
        {lists.data?.lists.map(list => <button key={list._id} className={listId === list._id ? 'active' : ''} onClick={() => choose(list._id)}><span><StarOutlined /> {list.name}</span><b>{list.ids.length}</b></button>)}
        {lists.data?.lists.length === 0 && <p className="muted">Create a list, then save stocks using the + button.</p>}
        <p className="watchlists-note">Watching a stock does not qualify it or place an order. Manage trade eligibility in <Link to="/qualification">Qualification</Link>.</p>
      </aside>
      <section className="watchlists-content" aria-label="Stock browser">
        <div className="watchlists-table-heading"><div><h2>{current?.name ?? (listId ? 'Watchlist' : 'All stocks')}</h2><p>{listId ? 'Your saved stocks, across exchanges.' : 'NSE and BSE cash listings in your imported universe. Each exchange listing is shown separately.'}</p></div><Space wrap>{current && <><Button aria-label="Rename watchlist" icon={<EditOutlined />} onClick={() => setDialog({ list: current })} /><Popconfirm title={`Delete ${current.name}?`} description="This removes the watchlist, not stocks or trades." onConfirm={deleteList}><Button danger disabled={busy}>Delete list</Button></Popconfirm></>}<Button icon={<ReloadOutlined />} aria-label="Refresh stock list" onClick={() => { stocks.retry(); lists.retry(); }} /></Space></div>
        <div className="watchlists-toolbar"><Input aria-label="Search stock universe" prefix={<SearchOutlined />} allowClear placeholder="Symbol, company or ISIN" value={query} onChange={e => setQuery(e.target.value)} /><Select aria-label="Stock exchange" allowClear placeholder="All exchanges" value={exchange} onChange={setExchange} options={['NSE', 'BSE'].map(value => ({ value, label: value }))} /><StockFeedStatus status={status} /></div>
        {stocks.error && <Alert type="warning" showIcon title={stocks.error} action={<Button onClick={stocks.retry}>Retry</Button>} />}
        {quoteError && !status.marketClosed && status.state !== 'streaming' && <Alert type="warning" showIcon title={quoteError} />}
        <Table<BrowseStock> size="small" rowKey="_id" loading={stocks.loading} dataSource={rows} scroll={{ x: 750 }}
          pagination={{ current: stocks.data?.page ?? page, pageSize: pagination.size, total: stocks.data?.total ?? 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total, range) => `${total ? range[0] : 0}–${range[1]} of ${total.toLocaleString()} stocks` }}
          onChange={(p, _filters, sorter, extra) => { if (extra.action === 'sort') { const s = Array.isArray(sorter) ? sorter[0] : sorter; setSort({ field: s.order ? String(s.columnKey) : 'symbol', order: s.order === 'descend' ? 'desc' : 'asc' }); } else setPagination({ key, page: p.pageSize !== pagination.size ? 1 : p.current ?? 1, size: p.pageSize ?? 20 }); }}
          locale={{ emptyText: <Empty description={search || exchange ? 'No stocks match these filters' : listId ? 'This watchlist is empty' : 'Import the stock universe in Connections & Data'}>{listId && !search && !exchange && <Button onClick={() => choose('')}>Browse all stocks</Button>}</Empty> }}
          columns={[
            { title: 'Stock', key: 'symbol', sorter: true, sortOrder: sort.field === 'symbol' ? sort.order === 'asc' ? 'ascend' : 'descend' : null, width: 250, render: (_, row) => <><button className="stock-symbol-button" onClick={() => setSelected(row)}>{row.symbol}</button><div className="muted stock-list-name">{row.name}</div>{!row.active && <Tag>Inactive listing</Tag>}</> },
            { title: 'Exchange', key: 'exchange', sorter: true, sortOrder: sort.field === 'exchange' ? sort.order === 'asc' ? 'ascend' : 'descend' : null, width: 95, dataIndex: 'exchange' },
            { title: 'Last price', align: 'right', width: 145, render: (_, row) => <StockPrice quote={quotes[row._id]} connected={isQuoteConnected(quotes[row._id], status)} now={now} /> },
            { title: 'Day change', align: 'right', width: 145, render: (_, row) => <StockChange quote={quotes[row._id]} /> },
            { title: 'Watchlist', width: 130, render: (_, row) => listId ? <Button size="small" disabled={busy} onClick={() => void remove(row)}>Remove</Button> : <Dropdown trigger={['click']} menu={{ items: [...(lists.data?.lists ?? []).map(list => ({ key: list._id, label: `${list.name}${list.ids.includes(row._id) ? ' · Saved' : ''}`, disabled: list.ids.includes(row._id) })), { key: '__new', label: 'New watchlist…', icon: <PlusOutlined /> }], onClick: ({ key: id }) => { if (id === '__new') setDialog({ stock: row }); else void add(row, id); } }}><Button size="small" disabled={busy || !row.active} icon={<PlusOutlined />} aria-label={`Save ${row.symbol} to watchlist`}>Save</Button></Dropdown> },
          ]} />
        <p className="watchlists-footnote">Quotes update for the visible page during market hours. Open a stock for candles, indicators and company details.</p>
      </section>
    </div>
    <StockDetailDrawer stock={selected ? { instrumentId: selected._id, instrument: selected, isin: selected.isin } : undefined} onClose={() => setSelected(undefined)} onPrevious={selectedIndex > 0 ? () => setSelected(rows[selectedIndex - 1]) : undefined} onNext={selectedIndex >= 0 && selectedIndex < rows.length - 1 ? () => setSelected(rows[selectedIndex + 1]) : undefined} />
    {dialog && <WatchlistNameModal list={dialog.list} onClose={() => setDialog(undefined)} onSaved={list => { const stock = dialog.stock; setDialog(undefined); lists.retry(); if (stock) void add(stock, list._id); else choose(list._id); }} />}
  </div>;
}
