import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Space, Table, Tag } from 'antd';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';

interface Quote { instrumentId: string; symbol: string; exchange: string; price: number; cumulativeVolume: number | null; at: string; fresh: boolean }
interface Feed { state: string; message: string; configured: boolean; workerRunning: boolean; limit?: number; quotes: Quote[]; instruments?: { id: string; symbol: string; exchange: string }[] }
interface Stock { _id: string; symbol: string; name: string; exchange: string; motilalCode?: number }
const schema = z.object({ ids: z.array(z.string()).min(1, 'Choose at least one stock').max(200) });
const otpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit OTP') });
export function MotilalConnection() {
  const { message } = App.useApp();
  const [feed, setFeed] = useState<Feed>(), [error, setError] = useState(''), [query, setQuery] = useState(''), [stocks, setStocks] = useState<Stock[]>([]), [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { ids: [] } });
  const otp = useForm<z.infer<typeof otpSchema>>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });
  useEffect(() => {
    const controller = new AbortController();
    const load = () => { void apiClient.get<Feed>('/market-feed', { signal: controller.signal }).then(r => { if (!controller.signal.aborted) { setFeed(r.data); setError(''); } }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); }); };
    load(); const timer = window.setInterval(load, 2500);
    return () => { clearInterval(timer); controller.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void apiClient.get<Stock[]>('/market-data/instruments', { params: { q: query }, signal: controller.signal }).then(r => { if (!controller.signal.aborted) setStocks(r.data); }).catch(() => {}); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  async function connect(values: z.infer<typeof schema>) {
    setBusy(true);
    try { await apiClient.post('/market-feed/connect', values); message.info('Motilal connection requested. Complete OTP below if required.'); }
    catch (e) { message.error((e as Error).message); } finally { setBusy(false); }
  }
  return <Card title="Motilal · live cash-equity ticks" extra={<Tag color={feed?.state === 'live' ? 'green' : feed?.state === 'error' ? 'red' : 'orange'}>{feed?.state ?? 'Checking service'}</Tag>}>
    {error && <Alert type="error" title={error} className="mb-5" />}
    <p className="muted">{feed?.message ?? 'Checking the market-feed worker.'}</p>
    <Form layout="vertical" onFinish={form.handleSubmit(connect)}>
      <RhfSelect name="ids" control={form.control} mode="multiple" label="Stocks to monitor" placeholder="Search NSE or BSE stocks" showSearch filterOption={false} onSearch={setQuery} options={stocks.map(x => ({ value: x._id, label: `${x.symbol} · ${x.exchange} · ${x.name}`, disabled: !x.motilalCode }))} />
      <p className="muted">Import Motilal instrument mappings below to enable stocks. Maximum {feed?.limit ?? 200} subscriptions per connection.</p>
      <Space><Button type="primary" htmlType="submit" loading={busy} disabled={!feed?.configured || !feed.workerRunning || ['connecting', 'otp-required'].includes(feed.state)}>Connect market feed</Button><Button danger disabled={!feed || feed.state === 'disconnected'} onClick={async () => { try { await apiClient.delete('/market-feed'); } catch (e) { message.error((e as Error).message); } }}>Disconnect feed</Button></Space>
    </Form>
    {feed?.state === 'otp-required' && <Form className="mt-5" layout="vertical" onFinish={otp.handleSubmit(async values => { try { await apiClient.post('/market-feed/otp', values); otp.reset(); message.info('OTP submitted for verification'); } catch (e) { message.error((e as Error).message); } })}>
      <RhfInput name="otp" control={otp.control} label="Motilal OTP" autoComplete="one-time-code" inputMode="numeric" maxLength={6} /><Button type="primary" htmlType="submit">Verify OTP</Button>
    </Form>}
    {!!feed?.quotes.length && <Table<Quote> size="small" className="mt-5" rowKey="instrumentId" dataSource={feed.quotes} pagination={{ pageSize: 5 }} scroll={{ x: 600 }} columns={[
      { title: 'Stock', render: (_, row) => `${row.symbol} · ${row.exchange}` }, { title: 'Last traded price', dataIndex: 'price', render: (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
      { title: 'Exchange time', dataIndex: 'at', render: (at: string) => new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) },
      { title: 'Freshness', dataIndex: 'fresh', render: (fresh: boolean) => <Tag color={fresh ? 'green' : 'orange'}>{fresh ? 'Fresh' : 'Stale · not executable'}</Tag> },
    ]} />}
  </Card>;
}
