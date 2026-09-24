import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Col, Form, Progress, Row, Space, Table, Tag } from 'antd';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import type { BackendBacktest } from '../types/backend';
import { BackendBacktestReport } from './BackendBacktestReport';
const schema = z.object({ strategyId: z.string().uuid('Save and select a strategy'), from: z.string().date(), to: z.string().date(), universe: z.enum(['historical', 'current']), includeManual: z.boolean(), acknowledgeSelectionBias: z.boolean(), ids: z.array(z.string()).min(1, 'Choose the qualified stocks to test').max(100, 'Select up to 100 stocks') })
  .refine(x => x.from <= x.to, { path: ['to'], message: 'End must follow start' })
  .refine(x => x.universe === 'historical' || x.acknowledgeSelectionBias, { path: ['acknowledgeSelectionBias'], message: 'Acknowledge the selection bias to continue' });
type Fields = z.infer<typeof schema>;
export function BackendBacktests({ strategies, selected }: { strategies: SavedStrategy[]; selected: string }) {
  const { message } = App.useApp(), [runs, setRuns] = useState<BackendBacktest[]>([]), [report, setReport] = useState<BackendBacktest>(), [error, setError] = useState<string>();
  const [stocks, setStocks] = useState<{ _id: string; symbol: string; exchange: string }[]>([]), [pending, setPending] = useState<string>();
  const initialized = useRef(false);
  const [dates] = useState(() => { const now = Date.now() + 19_800_000; const days = strategies.find(s => s._id === selected)?.entry.horizon === 'long-term' ? 1095 : strategies.find(s => s._id === selected)?.entry.horizon === 'swing' ? 365 : 30; return { to: new Date(now - 86400000).toISOString().slice(0, 10), from: new Date(now - days * 86400000).toISOString().slice(0, 10) }; });
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: { strategyId: strategies.some(s => s._id === selected) ? selected : strategies[0]?._id ?? '', ...dates, universe: 'current', includeManual: false, acknowledgeSelectionBias: false, ids: [] } });
  const universe = useWatch({ control: form.control, name: 'universe' });
  const refresh = useCallback(() => apiClient.get<BackendBacktest[]>('/backtests').then(response => { setRuns(response.data); setError(undefined); }).catch(e => { setError((e as Error).message); }), []);
  const openReport = useCallback((id: string) => apiClient.get<BackendBacktest>('/backtests/' + id).then(response => { setReport(response.data); }).catch(e => { message.error((e as Error).message); }), [message]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { const controller = new AbortController(); void apiClient.get<typeof stocks>('/paper/instruments', { signal: controller.signal }).then(r => setStocks(r.data)).catch(() => {}); return () => controller.abort(); }, []);
  useEffect(() => {
    const latest = runs.find(r => r.strategy._id === selected && r.status === 'completed');
    if (initialized.current || !latest) return;
    initialized.current = true; void openReport(latest._id);
    if (!form.formState.isDirty) form.reset({ strategyId: latest.strategy._id, from: new Date(Date.parse(latest.config.from) + 19_800_000).toISOString().slice(0, 10), to: new Date(Date.parse(latest.config.to) + 19_800_000 - 86400000).toISOString().slice(0, 10), universe: latest.config.universe, includeManual: latest.config.includeManual, acknowledgeSelectionBias: false, ids: latest.config.ids });
  }, [runs, selected, openReport, form]);
  useEffect(() => { if (pending && runs.find(r => r._id === pending)?.status === 'completed') { void openReport(pending).then(() => setPending(undefined)); } }, [runs, pending, openReport]);
  return <Space orientation="vertical" size={20} style={{ width: '100%' }}>
    {error && <Alert type="error" title={error} action={<Button onClick={() => void refresh()}>Retry</Button>}/>}
    {report && <BackendBacktestReport run={report}/>}
    <Card title="Run a backtest"><Form layout="vertical" onFinish={form.handleSubmit(async values => {
      try { const response = await apiClient.post<{ id: string }>('/backtests', values); setPending(response.data.id); message.info('Backtest queued. Missing history is downloaded first, then the candles are replayed.'); await refresh(); } catch (e) { message.error((e as Error).message); }
    })}>
      <RhfSelect control={form.control} name="strategyId" label="Saved buy/sell strategy" options={strategies.map(s => ({ value: s._id, label: s.name }))}/>
      <Row gutter={16}><Col xs={24} md={12}><RhfInput control={form.control} name="from" label="From" type="date" max={dates.to}/></Col><Col xs={24} md={12}><RhfInput control={form.control} name="to" label="Through" type="date" max={dates.to}/></Col></Row>
      <RhfSelect control={form.control} name="universe" label="Stock universe" options={[{ value: 'current', label: 'Current qualified list · retrospective research' }, { value: 'historical', label: 'Recorded historical lists · only from their publication dates' }]}/>
      <RhfSelect control={form.control} name="ids" label="Qualified stocks to test · up to 100" mode="multiple" showSearch optionFilterProp="label" allowClear options={stocks.map(s => ({ value: s._id, label: s.symbol + ' · ' + s.exchange }))}/>
      <Space orientation="vertical"><Controller control={form.control} name="includeManual" render={({ field }) => <Checkbox checked={field.value} onChange={e => field.onChange(e.target.checked)}>Include manually qualified stocks</Checkbox>}/>
        {universe === 'current' && <><Alert showIcon type="warning" title="Today's list contains information unavailable in the past" description="Use this mode to explore strategy behaviour. It cannot validate the historical qualification process."/><Controller control={form.control} name="acknowledgeSelectionBias" render={({ field }) => <Checkbox checked={field.value} onChange={e => field.onChange(e.target.checked)}>I understand this is retrospective research</Checkbox>}/>{form.formState.errors.acknowledgeSelectionBias && <span className="negative">{form.formState.errors.acknowledgeSelectionBias.message}</span>}</>}
        <p className="muted">Missing Dhan history and indicator warm-up are prepared automatically. Intraday: up to 90 days per run. Daily strategies: up to five years. Fees, slippage, stops and capital use the saved strategy settings.</p>
        <Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={!strategies.length}>Prepare data & run backtest</Button>
      </Space>
    </Form></Card>
    <Card title="Backtest runs"><Table<BackendBacktest> size="small" rowKey="_id" dataSource={runs} pagination={{ pageSize: 6 }} scroll={{ x: 800 }} columns={[
      { title: 'Strategy', render: (_, r) => r.strategy.name }, { title: 'Stocks', render: (_, r) => r.config.ids.length },
      { title: 'Status', render: (_, r) => <Tag color={r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : 'blue'}>{r.status === 'running' ? r.stage === 'preparing' ? 'Preparing history' : 'Calculating' : r.status}</Tag> },
      { title: 'Progress', render: (_, r) => r.status === 'running' && r.progress ? <div style={{ minWidth: 180 }}><Progress percent={Math.round(r.progress.processed / r.progress.total * 100)} size="small"/><small>{r.message}</small></div> : r.message ?? (r.progress ? r.progress.downloaded + ' stocks downloaded · ' + r.progress.reused + ' reused' : 'Waiting for worker') },
      { title: 'Report', render: (_, r) => <Button disabled={r.status !== 'completed'} onClick={() => void openReport(r._id)}>View report</Button> },
    ]}/></Card>
  </Space>;
}
