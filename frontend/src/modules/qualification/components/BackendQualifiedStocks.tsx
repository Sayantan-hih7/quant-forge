import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip } from 'antd';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfAutoComplete, RhfInput } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { QualificationState, QualifiedStock, RuleCapabilities } from '../types/backend';
import { StockIndexTags } from './StockIndexTags';
import { StockDetailDrawer } from '../../stock-details/components/StockDetailDrawer';
import { StockPrice, StockChange } from '../../stock-details/components/StockPrice';
import { useStockQuotes } from '../../stock-details/hooks/useStockQuotes';

const manualSchema = z.object({ search: z.string(), instrumentId: z.string().min(1, 'Choose a stock from the suggestions'), note: z.string().trim().min(1, 'Explain why you are adding this stock').max(500) });
type ManualFields = z.infer<typeof manualSchema>;
interface StockOption { _id: string; symbol: string; name: string; exchange: string }
export function BackendQualifiedStocks({ state, stocks, capabilities, refresh, onRules, visible = true }: { state: QualificationState; stocks: QualifiedStock[]; capabilities: RuleCapabilities; refresh: () => Promise<void>; onRules: () => void; visible?: boolean }) {
  const { message } = App.useApp();
  const [source, setSource] = useState('all'), [sector, setSector] = useState<string>(), [index, setIndex] = useState<string>(), [query, setQuery] = useState('');
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [options, setOptions] = useState<StockOption[]>([]), [busy, setBusy] = useState(false);
  const [pagination, setPagination] = useState({ key: '', page: 1 }), [selectedId, setSelectedId] = useState<string>();
  const form = useForm<ManualFields>({ resolver: zodResolver(manualSchema), defaultValues: { search: '', instrumentId: '', note: '' } });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { if (search.trim()) void apiClient.get<StockOption[]>('/market-data/instruments', { params: { q: search }, signal: controller.signal }).then(response => { if (!controller.signal.aborted) setOptions(response.data); }).catch(() => {}); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);
  async function remove(id?: string) {
    try { await apiClient.delete(`/qualification/manual${id ? `/${encodeURIComponent(id)}` : ''}`); await refresh(); }
    catch (error) { message.error((error as Error).message); }
  }
  async function add(values: ManualFields) {
    setBusy(true);
    try { await apiClient.post('/qualification/manual', { instrumentId: values.instrumentId, note: values.note }); setOpen(false); form.reset(); setSearch(''); await refresh(); }
    catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  const filtered = stocks.filter(row => (source === 'all' || row.source === source) && (!sector || row.metrics.sector === sector)
    && (!index || Array.isArray(row.metrics.index) && row.metrics.index.includes(index)) && (!query || `${row.instrument?.symbol} ${row.instrument?.name} ${row.isin}`.toLowerCase().includes(query.toLowerCase())));
  const filterKey = JSON.stringify([source, sector, index, query]);
  const page = Math.min(pagination.key === filterKey ? pagination.page : 1, Math.max(1, Math.ceil(filtered.length / 20)));
  const { quotes, status, error, now } = useStockQuotes(filtered.slice((page - 1) * 20, page * 20).map(row => row.instrumentId), visible);
  const selectedIndex = filtered.findIndex(row => row.instrumentId === selectedId);
  const manualCount = stocks.filter(row => row.source === 'manual').length;
  const latest = state.runs[0];
  const active = latest && ['queued', 'running'].includes(latest.status);
  const ready = latest?.status === 'completed' && latest.fingerprint === state.rule?.fingerprint;
  return <div className="monthly-rule-builder">
    <div className="q-section-heading"><div><h2>Qualified stocks</h2><p>{state.universe ? `${stocks.length} companies · ${manualCount} manually added` : 'Your monthly list will appear after you review and publish the scan'} · {state.month}</p></div><Space wrap>
      <Button onClick={onRules}>Edit monthly rules</Button>
      <Button type="primary" disabled={!state.canRun} loading={busy} onClick={async () => { setBusy(true); try { await apiClient.post('/qualification/runs'); await refresh(); } catch (error) { message.error((error as Error).message); } finally { setBusy(false); } }}>Run saved rules</Button>
    </Space></div>
    {!state.universe && <Alert className="mb-5" type="info" showIcon title={active ? 'Your first monthly scan is in progress' : ready ? `${latest.qualified.toLocaleString()} qualifying stocks ready to review` : 'No published list for this month'} description={active ? 'Follow data preparation and scan progress above. Once complete, review the results and publish your qualified list here.' : ready ? 'Open Review results in the latest scan, then publish the qualified list. Manual additions become available after publication.' : 'Save monthly rules and run a scan. Required data is prepared automatically before evaluation.'} />}
    <Space wrap className="mb-5">
      <Input.Search aria-label="Search qualified stocks" placeholder="Search stocks" value={query} onChange={event => setQuery(event.target.value)} style={{ width: 230 }} />
      <Select aria-label="Qualification source" value={source} onChange={setSource} style={{ width: 175 }} options={[{ value: 'all', label: 'All sources' }, { value: 'scan', label: 'From scan' }, { value: 'manual', label: 'Manually added' }]} />
      <Select aria-label="Filter by index" allowClear showSearch optionFilterProp="label" placeholder="All indices" value={index} onChange={setIndex} options={capabilities.choices.index} style={{ width: 200 }} />
      <Select aria-label="Filter by sector" allowClear showSearch optionFilterProp="label" placeholder="All sectors" value={sector} onChange={setSector} options={capabilities.choices.sector} style={{ width: 200 }} />
      <Button disabled={!state.universe} onClick={() => setOpen(true)}>Add stock manually</Button>
      <Popconfirm title={`Remove all ${manualCount} manual additions?`} description="Stocks qualified by the scan remain in the list." onConfirm={() => remove()}><Button danger disabled={!manualCount}>Remove all manual stocks</Button></Popconfirm>
    </Space>
    {filtered.length > 0 && <div className="stock-list-help"><span>Click a stock to explore its chart and company details.</span><span>{error || status.message || 'Live prices where available · hover the price status for its timestamp'}</span></div>}
    <Table<QualifiedStock> rowKey="instrumentId" size="small" scroll={{ x: 1250 }} dataSource={filtered} pagination={{ pageSize: 20, current: page, showSizeChanger: false, onChange: next => setPagination({ key: filterKey, page: next }) }} locale={{ emptyText: <Empty description="No stocks in this view" /> }} columns={[
      { title: 'Stock', width: 225, render: (_, row) => <><button className="stock-symbol-button" onClick={() => setSelectedId(row.instrumentId)} aria-label={`View ${row.instrument?.symbol ?? row.instrumentId} details`}>{row.instrument?.symbol ?? row.instrumentId}</button><div className="muted stock-list-name" title={row.instrument?.name}>{row.instrument?.name} · {row.instrument?.exchange}</div></> },
      { title: 'Last price', width: 130, align: 'right', render: (_, row) => <StockPrice quote={quotes[row.instrumentId]} connected={status.state === 'streaming'} now={now} /> },
      { title: 'Day change', width: 130, align: 'right', render: (_, row) => <StockChange quote={quotes[row.instrumentId]} /> },
      { title: 'Qualification', render: (_, row) => <Tooltip title={row.source === 'manual' ? `Custom qualification: ${row.note}. This stock is not marked as passing your monthly rule.` : 'Passed the saved monthly rule in the published scan.'}><Tag color={row.source === 'manual' ? 'purple' : 'green'}>{row.source === 'manual' ? 'Manually added' : 'From scan'}</Tag></Tooltip> },
      { title: 'Sector', render: (_, row) => String(row.metrics.sector ?? 'Not available') },
      { title: 'Index memberships', width: 240, render: (_, row) => Array.isArray(row.metrics.index) ? <StockIndexTags indices={row.metrics.index.map(String)} labels={Object.fromEntries(capabilities.choices.index.map(x => [x.value, x.label]))} /> : 'Not available' },
      { title: 'Delivery', render: (_, row) => typeof row.metrics.delivery === 'number' ? `${row.metrics.delivery.toFixed(2)}%` : '—' },
      { title: '', width: 145, render: (_, row) => <Space orientation="vertical" size={0}><Button type="link" size="small" onClick={() => setSelectedId(row.instrumentId)}>Chart & details</Button>{row.source === 'manual' && <Popconfirm title="Remove this manual stock?" onConfirm={() => remove(row.instrumentId)}><Button danger type="text" size="small">Remove</Button></Popconfirm>}</Space> },
    ]} />
    <StockDetailDrawer stock={visible && selectedIndex >= 0 ? filtered[selectedIndex] : undefined} onClose={() => setSelectedId(undefined)} onPrevious={selectedIndex > 0 ? () => setSelectedId(filtered[selectedIndex - 1].instrumentId) : undefined} onNext={selectedIndex >= 0 && selectedIndex < filtered.length - 1 ? () => setSelectedId(filtered[selectedIndex + 1].instrumentId) : undefined} />
    <Modal title="Add a custom qualified stock" open={open} onCancel={() => { setOpen(false); form.reset(); setSearch(''); }} footer={null} destroyOnHidden>
      <Alert className="mb-5" type="info" showIcon title="Your qualification, separate from the monthly rule" description="This addition will be labelled manually added. It will not claim to have passed the scan’s conditions." />
      <Form layout="vertical" onFinish={form.handleSubmit(add)}>
        <RhfAutoComplete control={form.control} name="search" label="Stock" onSearch={value => { setSearch(value); form.setValue('instrumentId', ''); }} filterOption={false} options={options.map(stock => ({ value: `${stock.symbol} · ${stock.exchange}`, label: `${stock.symbol} · ${stock.exchange} · ${stock.name}`, id: stock._id }))} onSelect={(_value, option) => form.setValue('instrumentId', String(option.id), { shouldValidate: true })} placeholder="Search a symbol or company" />
        {form.formState.errors.instrumentId && <p className="negative">{form.formState.errors.instrumentId.message}</p>}
        <RhfInput control={form.control} name="note" label="Reason for adding" placeholder="Your own research or qualification criteria" />
        <Button type="primary" htmlType="submit" loading={busy}>Add to qualified stocks</Button>
      </Form>
    </Modal>
  </div>;
}
