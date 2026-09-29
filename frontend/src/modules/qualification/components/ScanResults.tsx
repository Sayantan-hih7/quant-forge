import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Space, Table, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import { StockDetailDrawer } from '../../stock-details/components/StockDetailDrawer';
import { WatchlistButton } from '../../watchlists/components/WatchlistButton';
import { useStockActionData, useStockActions, type ActionStock } from '../../watchlists/hooks/useStockActions';
import { QualificationButton } from './QualificationButton';
import { monthlyFields } from '../config/monthlyFields';
import type { BackendScan } from '../types/backend';

interface Result {
  _id: string; instrumentId: string; instrument?: ActionStock; status: string;
  checks: { field: string; missingField?: string; matched: boolean | null; reason?: string; left?: number; right?: number; evidence?: { source: string; sourceUrl: string; period?: string } }[];
}
const labels: Record<string, string> = { qualified: 'Passed scan', rejected: 'Did not match rules', unavailable: 'Missing required data', awaiting_history: 'Awaiting monthly history' };
const colors: Record<string, string> = { qualified: 'green', rejected: 'default', unavailable: 'orange', awaiting_history: 'blue' };
export function ScanResults({ run, outsideUniverse = false, initialFilter, onChanged, visible = true }: { run: BackendScan; outsideUniverse?: boolean; initialFilter?: string; onChanged: () => Promise<void>; visible?: boolean }) {
  useStockActionData(visible);
  const { membership, error: actionsError, refresh } = useStockActions();
  const [filter, setFilter] = useState(initialFilter ?? 'all'), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ key: '', page: 1, size: 20 }), [selected, setSelected] = useState<ActionStock>();
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const key = JSON.stringify([run._id, filter, search, outsideUniverse]);
  const page = pagination.key === key ? pagination.page : 1;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pagination.size), q: search });
  if (filter !== 'all') params.set('status', filter);
  if (outsideUniverse) {
    params.set('outsideUniverse', 'true');
    // Refresh when manual additions or removals change the published membership.
    params.set('membership', `${membership?.month ?? ''}:${membership?.revision ?? 0}`);
  }
  const resource = useStockResource<{ rows: Result[]; total: number; page: number }>(`/qualification/runs/${run._id}/results?${params}`);
  const options = Object.entries(labels).filter(([value]) => !outsideUniverse || value !== 'qualified').map(([value, label]) => ({ value, label }));
  return <>
    <p className="muted mb-4">Scan from {new Date(run.cutoff).toLocaleString('en-IN')} · Rule revision {run.revision}{outsideUniverse ? ' · Stocks already in your published qualified list are excluded.' : ' · These are the original scan decisions; manual additions do not change them.'}</p>
    <Space wrap className="mb-5"><Input aria-label="Search scan results" prefix={<SearchOutlined />} placeholder="Symbol, company or ISIN" allowClear value={query} onChange={event => setQuery(event.target.value)} style={{ width: 250 }} />
      <Select aria-label="Filter scan results" value={filter} style={{ minWidth: 220 }} options={[{ value: 'all', label: outsideUniverse ? 'All non-qualified results' : 'All results' }, ...options]} onChange={setFilter} /></Space>
    {(outsideUniverse || ['awaiting_history', 'unavailable'].includes(filter)) && <Alert className="mb-5" showIcon type="info" title="A failed rule and missing data mean different things"
      description="Expand a row to see its checks. Missing inputs or insufficient monthly history leave a stock undecided. Add it to your watchlist to follow, or add it to qualification using your own research." />}
    {actionsError && <Alert className="mb-5" type="warning" title="Stock actions unavailable" description={actionsError} action={<Button onClick={() => void refresh()}>Retry</Button>} />}
    {resource.error && <Alert className="mb-5" type="error" title={resource.error} action={<Button onClick={resource.retry}>Retry results</Button>} />}
    <Table<Result> size="small" rowKey="_id" loading={resource.loading} dataSource={resource.data?.rows ?? []} scroll={{ x: 780 }}
      locale={{ emptyText: <Empty description={search || filter !== 'all' ? 'No stocks match these filters' : outsideUniverse ? 'No non-qualified stocks remain outside your published list in this scan' : 'No results yet'} /> }}
      pagination={{ current: resource.data?.page ?? page, pageSize: pagination.size, total: resource.data?.total ?? 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: total => `${total.toLocaleString()} stocks`, onChange: (current, size) => setPagination({ key, page: size !== pagination.size ? 1 : current, size }) }}
      columns={[
        { title: 'Watch', width: 60, render: (_, row) => row.instrument && <WatchlistButton stock={row.instrument} /> },
        { title: 'Stock', width: 220, render: (_, row) => <><button className="stock-symbol-button" disabled={!row.instrument} onClick={() => setSelected(row.instrument)}>{row.instrument?.symbol ?? row.instrumentId}</button><div className="muted stock-list-name">{row.instrument?.name} · {row.instrument?.exchange}</div></> },
        { title: 'Scan result', width: 220, render: (_, row) => <><Tag color={colors[row.status]}>{labels[row.status] ?? row.status}</Tag><div className="muted">{row.checks.filter(check => check.matched === false).length} failed · {row.checks.filter(check => check.matched === null).length} undecided</div></> },
        { title: 'Action', width: 215, render: (_, row) => row.instrument && <QualificationButton stock={row.instrument} onAdded={async () => { resource.retry(); await onChanged(); }} /> },
      ]}
      expandable={{ expandedRowRender: row => <Space orientation="vertical" size={10} aria-label={`Rule checks for ${row.instrument?.symbol ?? row.instrumentId}`}>{row.checks.map((check, i) => <div key={i}>
        <Tag color={check.matched === true ? 'green' : check.matched === null ? 'orange' : 'red'}>{check.matched === true ? 'Passed' : check.matched === null ? 'Undecided' : 'Failed'}</Tag><strong>{monthlyFields[check.missingField ?? check.field]?.label ?? check.missingField ?? check.field}</strong>
        <div>{check.reason ?? `Observed ${check.left?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) ?? 'not available'} · Compared with ${check.right ?? 'not available'}`}</div>
        {check.evidence && <div className="muted"><a href={check.evidence.sourceUrl} target="_blank" rel="noreferrer">View data source</a>{check.evidence.period && ` · Report period ${check.evidence.period}`}</div>}
      </div>)}</Space> }} />
    <StockDetailDrawer stock={visible && selected ? { instrumentId: selected._id, isin: selected.isin, instrument: selected } : undefined} onClose={() => setSelected(undefined)} />
  </>;
}
