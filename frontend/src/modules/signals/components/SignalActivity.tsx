import { useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Select, Table, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { RuleSummary } from '../../qualification/components/RuleSummary';
import { clockLabel } from '../utils/monitoring';
import type { MonitorSignal, SignalDisposition } from '../types/monitor';

export function SignalStatus({ value }: { value: SignalDisposition }) { return <Tag color={value === 'ready' ? 'green' : value === 'blocked' ? 'gold' : 'default'}>{value === 'ready' ? 'Signal ready' : value === 'blocked' ? 'Blocked' : 'Expired'}</Tag>; }
export function SignalActivity({ events }: { events: MonitorSignal[] }) {
  const [search, setSearch] = useState('');
  const [side, setSide] = useState('all');
  const [status, setStatus] = useState('all');
  const [detail, setDetail] = useState<string>();
  const selected = events.find(event => event.id === detail);
  const rows = events.filter(event => (side === 'all' || event.side === side) && (status === 'all' || event.disposition === status) && `${event.symbol} ${event.explanation}`.toLowerCase().includes(search.toLowerCase()));
  const columns: ColumnsType<MonitorSignal> = [
    { title: 'Stock / direction', key: 'stock', width: 170, render: (_, event) => <div className="monitor-stock"><strong>{event.symbol}</strong><span className={event.side === 'BUY' ? 'positive' : 'negative'}>{event.side === 'BUY' ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {event.side === 'BUY' ? 'BUY · Entry' : 'SELL · Exit'}{event.custom && <small>Custom addition</small>}{event.outsideUniverse && <small>Retained holding</small>}</span></div> },
    { title: 'Trigger', dataIndex: 'trigger', width: 125, render: (value, event) => <div className="monitor-cell"><strong>{value}</strong><small>{event.source}</small></div> },
    { title: 'Candle / detected', key: 'time', width: 135, render: (_, event) => <div className="monitor-cell monitor-numeric"><strong>{event.candle ? clockLabel(event.candle) : 'Price check'}</strong><small>{clockLabel(event.time)} IST</small></div> },
    { title: 'Status', dataIndex: 'disposition', width: 120, render: value => <SignalStatus value={value} /> },
    { title: 'Details', key: 'details', width: 80, render: (_, event) => <Button size="small" type="link" aria-label={`Details for ${event.symbol} ${event.side}`} onClick={() => setDetail(event.id)}>View</Button> },
  ];
  return <><div className="monitor-table-tools"><Input prefix={<SearchOutlined />} aria-label="Search signal activity" placeholder="Search stock or reason" value={search} onChange={event => setSearch(event.target.value)} allowClear /><Select aria-label="Signal direction" value={side} onChange={setSide} options={[{ value: 'all', label: 'Buy & sell' }, { value: 'BUY', label: 'Buy entries' }, { value: 'SELL', label: 'Sell exits' }]} /><Select aria-label="Signal status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'ready', label: 'Signal ready' }, { value: 'blocked', label: 'Blocked' }, { value: 'expired', label: 'Expired' }]} /></div>
    <Table className="monitor-events" columns={columns} rowKey="id" dataSource={rows} size="small" scroll={{ x: 650 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: total => `${total} events` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={events.length ? 'No signals match these filters.' : 'Waiting for a completed candle. Start monitoring or check the latest candles.'} /> }} />
    <div className="monitor-table-note">Signal ready = conditions matched. No orders or fills are created here. Intraday alerts expire after 30 demo seconds; daily alerts after 5 demo minutes.</div>
    <Drawer open={!!selected} onClose={() => setDetail(undefined)} title={selected ? `${selected.symbol} · ${selected.side === 'BUY' ? 'Buy entry' : 'Sell exit'}` : 'Signal details'} size={570}>{selected && <><div className="monitor-detail-status"><SignalStatus value={selected.disposition} /><Tag>{selected.source}</Tag></div><Alert showIcon type={selected.disposition === 'blocked' ? 'warning' : 'info'} title={selected.explanation} /><dl className="monitor-detail-grid"><dt>Strategy</dt><dd>{selected.strategy}</dd><dt>Completed candle</dt><dd>{selected.candle ? `${clockLabel(selected.candle)} IST` : 'Protective price / session check'}</dd><dt>Detected</dt><dd>{clockLabel(selected.time)} IST</dd><dt>Sample price</dt><dd>₹{selected.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</dd><dt>Eligibility</dt><dd>{selected.side === 'SELL' ? 'Held position; monthly membership is not required for exits.' : selected.custom ? 'Manually included. Does not imply a monthly-rule match.' : 'Current monthly qualified list.'}</dd><dt>Execution</dt><dd>Alerts only · no order submitted</dd></dl><RuleSummary rule={selected.rule} /></>}</Drawer>
  </>;
}
