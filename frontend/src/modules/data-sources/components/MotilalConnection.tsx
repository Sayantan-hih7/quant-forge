import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Form, Space, Table, Tag } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';

interface Quote { instrumentId: string; symbol: string; exchange: string; price: number; cumulativeVolume: number | null; at: string; fresh: boolean }
interface Feed { manualIds?: string[]; state: string; message: string; configured: boolean; workerRunning: boolean; enabled?: boolean; provider?: string; preference?: 'auto' | 'motilal' | 'dhan'; retryAt?: string; limit?: number; quotes: Quote[]; connections?: Record<string, { state: string; ids: string[] }>; instruments?: { id: string; symbol: string; exchange: string; code?: number }[] }
interface Stock { _id: string; symbol: string; name: string; exchange: string; motilalCode?: number }
const schema = z.object({ ids: z.array(z.string()).max(5000), provider: z.enum(['auto', 'motilal', 'dhan']) });
const otpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit OTP') });
export function MotilalConnection() {
  const { message } = App.useApp();
  const [feed, setFeed] = useState<Feed>(), [error, setError] = useState(''), [query, setQuery] = useState(''), [stocks, setStocks] = useState<Stock[]>([]), [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { ids: [], provider: 'auto' } });
  const selectedProvider = useWatch({ control: form.control, name: 'provider' });
  const initialized = useRef(false);
  const { reset, getFieldState } = form;
  const otp = useForm<z.infer<typeof otpSchema>>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });
  useEffect(() => {
    const controller = new AbortController();
    const load = () => { void apiClient.get<Feed>('/market-feed', { signal: controller.signal }).then(r => {
      if (controller.signal.aborted) return;
      setFeed(r.data); setError('');
      if (!initialized.current) {
        initialized.current = true;
        if (!getFieldState('ids').isDirty && !getFieldState('provider').isDirty) reset({ ids: r.data.manualIds ?? r.data.instruments?.map(s => s.id) ?? [], provider: r.data.preference ?? 'auto' });
      }
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); }); };
    load(); const timer = window.setInterval(load, 2500);
    return () => { clearInterval(timer); controller.abort(); };
  }, [reset, getFieldState]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void apiClient.get<Stock[]>('/market-data/instruments', { params: { q: query }, signal: controller.signal }).then(r => { if (!controller.signal.aborted) setStocks(r.data); }).catch(() => {}); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  async function connect(values: z.infer<typeof schema>) {
    setBusy(true);
    try { await apiClient.post('/market-feed/connect', values); message.info('Subscriptions saved. The feed connects during regular market sessions and recovers automatically.'); }
    catch (e) { message.error((e as Error).message); } finally { setBusy(false); }
  }
  const options = [...new Map([
    ...(feed?.instruments ?? []).map(s => [s.id, { value: s.id, label: `${s.symbol} · ${s.exchange}`, disabled: selectedProvider === 'motilal' && s.code === undefined }] as const),
    ...stocks.map(s => [s._id, { value: s._id, label: `${s.symbol} · ${s.exchange} · ${s.name}`, disabled: selectedProvider === 'motilal' && s.motilalCode === undefined }] as const),
  ]).values()];
  return <Card title="Live cash-equity feed" extra={<Tag color={feed?.state === 'live' ? 'green' : feed?.state === 'error' ? 'red' : 'orange'}>{feed?.state ?? 'Checking service'}</Tag>}>
    {error && <Alert type="error" title={error} className="mb-5" />}
    <p className="muted">{feed?.message ?? 'Checking the market-feed worker.'}</p>
    {Object.entries(feed?.connections ?? {}).map(([provider, connection]) => <Tag key={provider}>{provider === 'motilal' ? 'Motilal' : 'Dhan'} · {connection.ids.length} stocks · {connection.state}</Tag>)}
    {feed?.retryAt && <p className="muted">Retry at {new Date(feed.retryAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>}
    <Form layout="vertical" onFinish={form.handleSubmit(connect)}>
      <RhfSelect name="provider" control={form.control} label="Live data provider" options={[{value:'auto',label:'Automatic: Motilal + Dhan overflow and fallback'},{value:'motilal',label:'Motilal only'},{value:'dhan',label:'Dhan only'}]} />
      <RhfSelect name="ids" control={form.control} mode="multiple" label="Optional extra stock subscriptions" placeholder="Search NSE or BSE stocks" showSearch filterOption={false} onSearch={setQuery} options={options} />
      <p className="muted">Paper sessions and open stock views share live subscriptions automatically. Motilal handles up to 200 stocks; Dhan handles overflow and fallback, up to 5,000 total. Held positions and orders have priority. Pausing execution prevents paper fills; stock views can still show prices.</p>
      <Space><Button type="primary" htmlType="submit" loading={busy} disabled={!feed?.configured || !feed.workerRunning || ['connecting', 'otp-required'].includes(feed.state)}>Save feed settings</Button><Button danger disabled={!feed?.enabled} onClick={async () => { try { await apiClient.delete('/market-feed'); } catch (e) { message.error((e as Error).message); } }}>Pause execution feed</Button></Space>
    </Form>
    {(feed?.state === 'otp-required' || feed?.connections?.motilal?.state === 'otp-required') && <Form className="mt-5" layout="vertical" onFinish={otp.handleSubmit(async values => { try { await apiClient.post('/market-feed/otp', values); otp.reset(); message.info('OTP submitted for verification'); } catch (e) { message.error((e as Error).message); } })}>
      <RhfInput name="otp" control={otp.control} label="Motilal OTP" autoComplete="one-time-code" inputMode="numeric" maxLength={6} /><Button type="primary" htmlType="submit">Verify OTP</Button>
    </Form>}
    {!!feed?.quotes.length && <Table<Quote> size="small" className="mt-5" rowKey="instrumentId" dataSource={feed.quotes} pagination={{ pageSize: 5 }} scroll={{ x: 600 }} columns={[
      { title: 'Stock', render: (_, row) => `${row.symbol} · ${row.exchange}` }, { title: 'Last traded price', dataIndex: 'price', render: (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
      { title: 'Exchange time', dataIndex: 'at', render: (at: string) => new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) },
      { title: 'Freshness', dataIndex: 'fresh', render: (fresh: boolean) => <Tag color={fresh ? 'green' : 'orange'}>{fresh ? 'Fresh' : 'Stale · not executable'}</Tag> },
    ]} />}
  </Card>;
}
