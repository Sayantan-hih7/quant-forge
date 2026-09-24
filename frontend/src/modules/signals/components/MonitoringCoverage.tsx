import { useState } from 'react';
import { Button, Input, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import type { MonthlyCache } from '../../qualification/types';
import type { WatchedPosition } from '../types/monitor';

interface CoverageRow { symbol: string; name: string; entry: boolean; custom: boolean; positions: WatchedPosition[] }
export function MonitoringCoverage({ cache, positions, entriesPaused, active, feedReady, onPaper }: { cache?: MonthlyCache; positions: WatchedPosition[]; entriesPaused: boolean; active: boolean; feedReady: boolean; onPaper: (session?: string) => void }) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('all');
  const rows = new Map<string, CoverageRow>((cache?.candidates ?? []).map(stock => [stock.symbol, { symbol: stock.symbol, name: stock.name, entry: true, custom: stock.qualificationSource === 'manual', positions: [] }]));
  positions.forEach(position => { const row = rows.get(position.symbol) ?? { symbol: position.symbol, name: position.stock.name, entry: false, custom: false, positions: [] }; row.positions.push(position); rows.set(position.symbol, row); });
  const columns: ColumnsType<CoverageRow> = [
    { title: 'Stock', key: 'stock', width: 175, render: (_, row) => <div className="monitor-stock"><strong>{row.symbol}</strong><small>{row.name}</small></div> },
    { title: 'Entry eligibility', key: 'entry', width: 150, render: (_, row) => <div className="monitor-cell"><Tag color={row.entry ? row.custom ? 'purple' : 'blue' : 'default'}>{row.entry ? row.custom ? 'Custom addition' : 'Monthly qualified' : 'Exit only'}</Tag><small>{!row.entry ? 'Outside monthly list' : entriesPaused ? 'New entries paused' : active && feedReady ? 'Entry checks enabled' : 'Awaiting monitoring'}</small></div> },
    { title: 'Held position / exit coverage', key: 'position', width: 215, render: (_, row) => row.positions.length ? <div className="monitor-cell"><strong>{row.positions.reduce((sum, position) => sum + position.quantity, 0)} shares · {active && feedReady ? 'Exit checks on' : 'Exit checks unavailable'}</strong><small>{[...new Set(row.positions.map(position => position.source))].join(' + ')} · original exit rules retained</small></div> : <span className="muted">No held position</span> },
    { title: '', key: 'action', width: 90, render: (_, row) => row.positions.some(position => position.source === 'Paper') ? <Button size="small" type="link" onClick={() => onPaper(row.positions.find(position => position.sessionId)?.sessionId)}>Open paper</Button> : null },
  ];
  const data = [...rows.values()].filter(row => `${row.symbol} ${row.name}`.toLowerCase().includes(search.toLowerCase()) && (scope === 'all' || scope === 'held' && row.positions.length || scope === 'outside' && !row.entry || scope === 'custom' && row.custom));
  return <><div className="monitor-table-tools"><Input prefix={<SearchOutlined />} aria-label="Search monitoring coverage" placeholder="Search covered stocks" value={search} onChange={event => setSearch(event.target.value)} allowClear /><Select aria-label="Coverage scope" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All covered stocks' }, { value: 'held', label: 'Held positions' }, { value: 'outside', label: 'Outside monthly list' }, { value: 'custom', label: 'Custom additions' }]} /></div><Table columns={columns} rowKey="symbol" dataSource={data} size="small" scroll={{ x: 660 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: total => `${total} stocks` }} /><div className="monitor-table-note">Monthly-list changes affect new entries. Held positions retain their saved sell rules and protective thresholds until closed in Paper Trading. Sample positions never create paper trades.</div></>;
}
