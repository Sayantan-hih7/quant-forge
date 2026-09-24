import { useEffect, useState } from 'react';
import { App, Button, Card, Col, Form, Row, Space, Table, Tag } from 'antd';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfAutoComplete, RhfInput, RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { DataStatus } from '../types';

const schema = z.object({ search: z.string(), instrumentId: z.string().min(1, 'Choose a stock from the suggestions'), interval: z.enum(['1d', '1m']), from: z.string().date(), to: z.string().date() }).refine(x => x.from < x.to, { path: ['to'], message: 'End date must follow the start date' });
type Fields = z.infer<typeof schema>;
interface Stock { _id: string; symbol: string; exchange: string; name: string }
interface Fact { _id: string; field: string; value: string | string[] | number; source: string; knownAt: string; period?: string }
const labels: Record<string, string> = { index: 'Index memberships', pledge: 'Promoter pledge (%)', delivery: 'Monthly delivery (%)', tradedValue: 'Monthly traded value (₹ Cr)', turnover: 'Average daily turnover (₹ Cr)', marketCap: 'Market cap (₹ Cr)', debtEquity: 'Debt / equity', pe: 'P/E', roe: 'ROE (%)', roce: 'ROCE (%)', sector: 'Sector', industry: 'Industry', promoterHolding: 'Promoter holding (%)', fiiChange: 'FII change (percentage points)', diiChange: 'DII change (percentage points)' };
export function HistoricalImport({ data, refresh }: { data: DataStatus; refresh: () => Promise<void> }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState(''), [stocks, setStocks] = useState<Stock[]>([]), [facts, setFacts] = useState<Fact[]>([]), [busy, setBusy] = useState(false);
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: { search: '', instrumentId: '', interval: '1d', from: `${new Date().getFullYear() - 3}-01-01`, to: new Date().toISOString().slice(0, 10) } });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!query.trim()) { setStocks([]); return; }
      void apiClient.get<Stock[]>('/market-data/instruments', { params: { q: query }, signal: controller.signal }).then(r => { if (!controller.signal.aborted) setStocks(r.data); }).catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  async function select(id: string) {
    form.setValue('instrumentId', id, { shouldValidate: true });
    try { const response = await apiClient.get<{ facts: Fact[] }>(`/market-data/instruments/${encodeURIComponent(id)}`); if(form.getValues('instrumentId')===id)setFacts(response.data.facts); }
    catch (e) { message.error((e as Error).message); }
  }
  async function submit(values: Fields) {
    setBusy(true);
    try { await apiClient.post('/market-data/imports', { kind: 'history', ids: [values.instrumentId], interval: values.interval, from: values.from, to: values.to }); message.info('Historical import queued'); await refresh(); }
    catch (e) { message.error((e as Error).message); } finally { setBusy(false); }
  }
  return <Card title="Inspect a stock & download history">
    <Form layout="vertical" onFinish={form.handleSubmit(submit)}>
      <RhfAutoComplete name="search" control={form.control} label="Stock · search across NSE and BSE" filterOption={false}
        options={stocks.map(x => ({ value: `${x.symbol} · ${x.exchange}`, label: <Space><strong>{x.symbol}</strong><Tag>{x.exchange}</Tag><span>{x.name}</span></Space>, instrumentId: x._id }))}
        onSearch={text => { setQuery(text); form.setValue('instrumentId', ''); setFacts([]); }}
        onSelect={(_value, option) => { void select(String(option.instrumentId)); }} placeholder="Search a company, symbol or ISIN" />
      {form.formState.errors.instrumentId && <p className="negative">{form.formState.errors.instrumentId.message}</p>}
      <Row gutter={16}><Col xs={24} md={8}><RhfSelect name="interval" control={form.control} label="Stored candles" options={[{ value: '1d', label: 'Daily · monthly qualification and swing' }, { value: '1m', label: '1 minute · intraday strategies' }]} /></Col><Col xs={12} md={8}><RhfInput name="from" control={form.control} label="From" type="date" /></Col><Col xs={12} md={8}><RhfInput name="to" control={form.control} label="To · exclusive" type="date" /></Col></Row>
      <Button type="primary" htmlType="submit" loading={busy} disabled={!data.dhan.connected}>Download historical candles</Button>
      {!data.dhan.connected && <p className="muted mt-3">Connect Dhan above to download historical candles.</p>}
    </Form>
    {!!facts.length && <Table<Fact> size="small" className="mt-5" rowKey="_id" dataSource={facts} pagination={false} scroll={{ x: 600 }} columns={[
      { title: 'Field', dataIndex: 'field', render: (field: string) => labels[field] ?? field },
      { title: 'Value', dataIndex: 'value', render: (value: Fact['value']) => Array.isArray(value) ? <Space wrap>{value.map(id => <Tag key={id}>{data.indices.find(x => x.id === id)?.name ?? id}</Tag>)}</Space> : typeof value === 'number' ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : value },
      { title: 'Source', dataIndex: 'source' }, { title: 'Period', dataIndex: 'period', render: (period?: string) => period || 'Current snapshot' },
      { title: 'Collected', dataIndex: 'knownAt', render: (at: string) => new Date(at).toLocaleDateString() },
    ]} />}
  </Card>;
}
