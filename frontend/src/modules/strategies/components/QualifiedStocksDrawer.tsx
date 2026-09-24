import { useState } from 'react';
import { Alert, Button, Drawer, Input, Select, Table, Tag } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { UniverseSnapshot } from '../types/workspace';
import { formatMonth } from '../utils/monthlyCycle';

export function QualifiedStocksDrawer({ snapshot, matchedSymbols, title, kind = 'universe', onClose }: {
  snapshot: UniverseSnapshot; matchedSymbols?: string[]; title?: string; kind?: 'universe' | 'watchlist' | 'signals'; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('all');
  const universe = matchedSymbols ? snapshot.stocks.filter((stock) => matchedSymbols.includes(stock.symbol)) : snapshot.stocks;
  const rows = universe.filter((stock) => `${stock.symbol} ${stock.name}`.toLowerCase().includes(search.toLowerCase()) && (sector === 'all' || stock.sector === sector));
  const download = () => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [['Symbol', 'Name', 'Sector', 'Snapshot month', '6M return %', 'Turnover Cr'], ...rows.map((s) => [s.symbol, s.name, s.sector, snapshot.month, s.momentum, s.turnover])].map((row) => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `quantforge-${kind}-${snapshot.month}-v${snapshot.version}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Drawer open size={850} onClose={onClose} title={title ?? 'Qualified stock universe'} extra={<Button icon={<DownloadOutlined />} onClick={download}>Export CSV</Button>}>
    <div className="universe-drawer-summary"><div><strong>{universe.length} stocks</strong><p>{formatMonth(snapshot.month)} · Base snapshot v{snapshot.version}</p></div><Tag color="blue">{kind === 'universe' ? 'Saved monthly universe' : kind === 'watchlist' ? 'Qualified watchlist' : 'Demo entry signals'}</Tag></div>
    <Alert type="info" className="mb-5" title={kind === 'universe' ? 'This is the saved list, not a new scan.' : kind === 'watchlist' ? 'Qualified from the monthly universe only.' : 'Signals are restricted to the qualified watchlist.'} description="These are synthetic demo results. Values below belong to the saved monthly base; opening this list does not rerun qualification or check signals." />
    <div className="universe-search"><Input aria-label="Search qualified stocks" placeholder="Search symbol or company" prefix={<SearchOutlined />} value={search} onChange={(event) => setSearch(event.target.value)} allowClear /><Select aria-label="Filter by sector" value={sector} onChange={setSector} options={[{ value: 'all', label: 'All sectors' }, ...[...new Set(universe.map((stock) => stock.sector))].map((value) => ({ value, label: value }))]} /></div>
    <Table rowKey="symbol" size="small" dataSource={rows} scroll={{ x: 620 }} pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} stocks` }} columns={[
      { title: 'Stock', dataIndex: 'symbol', width: 200, render: (_, stock) => <div className="universe-stock"><strong>{stock.symbol}</strong><small>{stock.name}</small></div> },
      { title: 'Sector', dataIndex: 'sector' },
      { title: '6M return', dataIndex: 'momentum', align: 'right', sorter: (a, b) => a.momentum - b.momentum, render: (value: number) => `${value.toFixed(2)}%` },
      { title: 'Avg. turnover', dataIndex: 'turnover', align: 'right', render: (value: number) => `₹${value.toFixed(1)} Cr` },
      { title: 'Monthly base', render: () => <span className="positive">Qualified</span> },
    ]} locale={{ emptyText: 'No stocks match these filters.' }} />
  </Drawer>;
}
