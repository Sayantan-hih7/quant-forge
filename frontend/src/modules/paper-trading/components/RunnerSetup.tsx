import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Space, Table, Tag } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import type { PaperSession } from '../hooks/useBackendPaper';
import type { BackendBacktest } from '../../backtesting/types/backend';
const schema = z.object({ strategyId: z.string().uuid('Choose a saved strategy'), ids: z.array(z.string()).min(1, 'Select qualified stocks to monitor').max(100, 'Select at most 100 stocks'), mode: z.enum(['automatic', 'confirmation']) });
interface Check { field: string; matched: boolean | null; left?: number; right?: number; reason?: string }
interface Result { id: string; symbol: string; barEnd: string | null; freshQuote: boolean; entry: { matched: boolean | null; checks: Check[] }; exit: { matched: boolean | null; checks: Check[] } }
interface Preview { strategyId: string; revision: number; checkedAt: string; results: Result[]; feed: { state: string; message: string } }
const verdict = (matched: boolean | null) => <Tag color={matched === null ? 'gold' : matched ? 'green' : 'default'}>{matched === null ? 'Data unavailable' : matched ? 'Conditions met' : 'Not met'}</Tag>;
export function RunnerSetup({ strategies, sessions, onStarted }: { strategies: SavedStrategy[]; sessions: PaperSession[]; onStarted: (id: string) => Promise<void> }) {
  const [params] = useSearchParams(), { message } = App.useApp();
  const [stocks, setStocks] = useState<{ _id: string; symbol: string; exchange: string }[]>([]), [preview, setPreview] = useState<Preview>(), [checking, setChecking] = useState(false), [handoff, setHandoff] = useState<string>();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { strategyId: params.get('strategy') ?? '', ids: [], mode: 'confirmation' } });
  const selectedStrategy = useWatch({ control: form.control, name: 'strategyId' }), selectedIds = useWatch({ control: form.control, name: 'ids' });
  const currentPreview = preview?.strategyId === selectedStrategy && preview.results.map(r => r.id).sort().join(',') === [...selectedIds].sort().join(',') ? preview : undefined;
  const monitoring = sessions.some(session => session.strategy._id === selectedStrategy && session.active);
  useEffect(() => {
    const controller = new AbortController();
    void apiClient.get<typeof stocks>('/paper/instruments', { signal: controller.signal }).then(r => setStocks(r.data)).catch(() => {});
    const backtest = params.get('backtest');
    if (backtest) void apiClient.get<BackendBacktest>('/backtests/' + backtest, { signal: controller.signal }).then(r => {
      if (r.data.status !== 'completed') return;
      form.reset({ strategyId: r.data.strategy._id, ids: r.data.config.ids, mode: 'confirmation' });
      setHandoff('Loaded ' + r.data.strategy.name + ' and its ' + r.data.config.ids.length + ' tested stocks. Check the current saved rules before starting. Backtested positions are not carried into paper trading.');
    }).catch(() => {});
    return () => controller.abort();
  }, [params, form]);
  return <Card title="1. Choose strategy and stock scope">
    {handoff && <Alert className="mb-5" type="info" showIcon title="Loaded from backtest" description={handoff}/>}
    <Form layout="vertical" onValuesChange={() => setPreview(undefined)} onFinish={form.handleSubmit(async values => {
      try { const result = await apiClient.post<{ _id: string }>('/paper/sessions', values); await onStarted(result.data._id); message.success('Paper monitoring session created. Its feed status is shown below.'); } catch (e) { message.error((e as Error).message); }
    })}>
      <RhfSelect control={form.control} name="strategyId" label="Saved strategy · buy + sell + risk" options={strategies.map(s => ({ value: s._id, label: s.name }))}/>
      <RhfSelect control={form.control} name="ids" label="Qualified stocks to monitor · up to 100" mode="multiple" showSearch optionFilterProp="label" options={stocks.map(s => ({ value: s._id, label: s.symbol + ' · ' + s.exchange }))}/>
      <RhfSelect control={form.control} name="mode" label="What happens after a new signal?" options={[{ value: 'confirmation', label: 'Ask me before each paper buy or sell' }, { value: 'automatic', label: 'Automatically execute paper buys and sells' }]}/>
      <Space wrap><Button loading={checking} disabled={!strategies.length} onClick={form.handleSubmit(async ({ strategyId, ids }) => {
        setChecking(true); setPreview(undefined); try { setPreview((await apiClient.post<Preview>('/paper/preview', { strategyId, ids }, { timeout: 120000 })).data); } catch (e) { message.error((e as Error).message); } finally { setChecking(false); }
      })}>Check saved candles</Button><Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={!strategies.length || monitoring}>{monitoring ? 'Paper session already started' : 'Start paper monitoring'}</Button></Space>
      <p className="muted mt-3">Check saved candles explains both rules using the latest stored completed candle; it creates no orders. Start paper monitoring waits for new candles and a connected execution feed. Stocks removed from qualification cannot receive new automatic entries; held shares retain their sell rules.</p>
    </Form>
    {currentPreview && <section aria-label="Saved candle rule results" className="mt-5"><Alert type="info" showIcon title="Rule inspection · saved candles" description="Buy conditions are relevant when you do not hold a stock. Sell conditions are relevant when you hold it. A match here is historical inspection, not a live trade instruction."/>
      <Table<Result> size="small" rowKey="id" dataSource={currentPreview.results} pagination={{ pageSize: 10 }} scroll={{ x: 750 }} columns={[
        { title: 'Stock', dataIndex: 'symbol' }, { title: 'Candle closed (IST)', dataIndex: 'barEnd', render: value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'No stored candle' },
        { title: 'Buy rules · if not held', render: (_, row) => verdict(row.entry.matched) }, { title: 'Sell rules · if held', render: (_, row) => verdict(row.exit.matched) },
      ]} expandable={{ expandedRowRender: row => <Space orientation="vertical">{(['entry', 'exit'] as const).map(side => <div key={side}><strong>{side === 'entry' ? 'Buy checks' : 'Sell checks'}</strong>{row[side].checks.map((check, i) => <p key={i}>{verdict(check.matched)} {check.field}{check.left == null ? '' : ': ' + check.left.toFixed(2)}{check.right == null ? '' : ' / comparison ' + check.right.toFixed(2)} {check.reason}</p>)}</div>)}</Space> }}/>
    </section>}
  </Card>;
}
