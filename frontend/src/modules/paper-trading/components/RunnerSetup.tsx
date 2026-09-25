import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Collapse, Form, Space, Table, Tag } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { useQualifiedStockScope } from '../../strategies/hooks/useQualifiedStockScope';
import { QualifiedStockPicker } from '../../strategies/components/QualifiedStockPicker';
import { StrategySummaryStrip } from '../../strategies/components/StrategySummaryStrip';
import { StrategyDraftPreview } from '../../strategies/components/StrategyDraftPreview';
import type { PaperSession } from '../hooks/useBackendPaper';
import type { BackendBacktest } from '../../backtesting/types/backend';
import '../../../styles/strategy-studio.css';
import '../../../styles/strategy-workflow.css';

const schema = z.object({ strategyId: z.string().uuid('Choose a saved strategy'), ids: z.array(z.string()).min(1, 'Select qualified stocks to inspect').max(100, 'Select at most 100 stocks'), mode: z.enum(['automatic', 'confirmation']) });
interface Check { field: string; matched: boolean | null; left?: number; right?: number; reason?: string }
interface Result { id: string; symbol: string; barEnd: string | null; freshQuote: boolean; entry: { matched: boolean | null; checks: Check[] }; exit: { matched: boolean | null; checks: Check[] } }
interface Preview { strategyId: string; revision: number; checkedAt: string; results: Result[]; feed: { state: string; message: string } }
const verdict = (matched: boolean | null) => <Tag color={matched === null ? 'gold' : matched ? 'green' : 'default'}>{matched === null ? 'Data unavailable' : matched ? 'Conditions met' : 'Not met'}</Tag>;

export function RunnerSetup({ strategies, sessions, onStarted }: { strategies: SavedStrategy[]; sessions: PaperSession[]; onStarted: (id: string) => Promise<void> }) {
  const [params] = useSearchParams(), navigate = useNavigate(), { message } = App.useApp();
  const [preview, setPreview] = useState<Preview>(), [checking, setChecking] = useState(false), [error, setError] = useState<string>();
  const backtestId = params.get('backtest');
  const [handoff, setHandoff] = useState<{ id: string; run?: BackendBacktest; error?: string }>();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { strategyId: params.get('strategy') ?? '', ids: [], mode: 'confirmation' } });
  const selectedStrategy = useWatch({ control: form.control, name: 'strategyId' }), selectedIds = useWatch({ control: form.control, name: 'ids' });
  const strategy = strategies.find(s => s._id === selectedStrategy);
  const scope = useQualifiedStockScope({ universe: 'current', includeManual: true });
  const loadingHandoff = !!backtestId && handoff?.id !== backtestId;
  const validScope = !scope.loading && !scope.error && selectedIds.every(id => scope.stocks.some(s => s._id === id));
  const currentPreview = preview?.strategyId === selectedStrategy && preview.revision === strategy?.revision && preview.results.map(r => r.id).sort().join(',') === [...selectedIds].sort().join(',') ? preview : undefined;
  const monitoring = sessions.some(session => session.strategy._id === selectedStrategy && session.active);
  useEffect(() => {
    if (!backtestId) return;
    const controller = new AbortController();
    void apiClient.get<BackendBacktest>('/backtests/' + backtestId, { signal: controller.signal }).then(r => {
      if (controller.signal.aborted) return;
      if (!r.data || r.data.status !== 'completed') { setHandoff({ id: backtestId, error: 'This backtest has no completed report. Choose a saved strategy below.' }); return; }
      form.reset({ strategyId: r.data.strategy._id, ids: r.data.config.ids, mode: 'confirmation' });
      setHandoff({ id: backtestId, run: r.data });
    }).catch(e => { if (!controller.signal.aborted) setHandoff({ id: backtestId, error: (e as Error).message }); });
    return () => controller.abort();
  }, [backtestId, form]);
  const tested = handoff?.id === backtestId && handoff.run?.strategy._id === selectedStrategy ? handoff.run : undefined;
  return <div className="runner-workflow">
    {handoff?.error && <Alert showIcon type="warning" title="Backtest selection could not be loaded" description={handoff.error} />}
    {tested && <Alert showIcon type={tested.strategy.revision === strategy?.revision ? 'info' : 'warning'} title={tested.strategy.revision === strategy?.revision ? 'Strategy and stocks loaded from your backtest' : 'The strategy has changed since this backtest'} description={tested.strategy.revision === strategy?.revision ? 'Inspect the latest saved candles below. Backtested positions are not carried into paper trading.' : `That report used revision ${tested.strategy.revision}. Inspection and new monitoring sessions use the current saved rules. Backtest them again before relying on the earlier result.`} />}
    <Card title="Inspect a strategy" extra={<Tag>Buy + sell rules</Tag>}>
      {!strategies.length && <Alert className="mb-5" type="info" showIcon title="Create and save a strategy first" action={<Button onClick={() => navigate('/strategies')}>Go to strategies</Button>} />}
      <Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit(async values => {
        if (!strategy || !validScope || !currentPreview) return;
        setError(undefined);
        try { const result = await apiClient.post<{ _id: string }>('/paper/sessions', { ...values, expectedRevision: strategy.revision }); await onStarted(result.data._id); message.success('Paper monitoring started. Watch its session status below.'); }
        catch (e) { setError((e as Error).message); }
      })}>
        <div className="backtest-config-grid"><section><h3>1. Select saved rules</h3><p>Both buy and sell conditions belong to the same strategy.</p><RhfSelect control={form.control} name="strategyId" label="Strategy" disabled={loadingHandoff || checking} loading={loadingHandoff} placeholder="Choose a saved strategy" options={strategies.map(s => ({ value: s._id, label: s.name }))} />
          {strategy && <><StrategySummaryStrip strategy={strategy} revision={strategy.revision} /><Space className="mt-3" wrap><Button onClick={() => navigate(`/strategies?tab=rules&rule=${strategy._id}`)}>Edit strategy</Button><Button onClick={() => navigate(`/strategies?tab=backtests&rule=${strategy._id}`)}>Backtest strategy</Button></Space><Collapse ghost items={[{ key: 'rules', label: 'Review buy, sell & risk settings', children: <StrategyDraftPreview draft={strategy} changed={false} saved /> }]} /></>}
          {!strategy && !!selectedStrategy && !loadingHandoff && <Alert type="warning" title="This strategy is no longer available. Choose another saved strategy." />}
        </section><section><h3>2. Choose current qualified stocks</h3><p>Includes stocks from the monthly scan and manual additions. Removed stocks must be cleared from this selection.</p><Controller control={form.control} name="ids" render={({ field, fieldState }) => <QualifiedStockPicker {...scope} loading={scope.loading || loadingHandoff || checking} value={field.value} onChange={field.onChange} validationError={fieldState.error?.message} onRetry={scope.retry} />} /></section></div>
        {error && <Alert className="mb-5" showIcon type="error" title="The action could not be completed" description={error} />}
        <div className="runner-actions"><div><strong>3. Inspect the latest completed candles</strong><p>Shows whether each stock meets the buy and sell rules using stored data. This check does not monitor new candles or create orders.</p></div><Button type="primary" loading={checking} disabled={!strategy || !validScope || loadingHandoff} onClick={form.handleSubmit(async ({ strategyId, ids }) => {
          if (!strategy || !validScope) return;
          setChecking(true); setError(undefined); setPreview(undefined);
          try { setPreview((await apiClient.post<Preview>('/paper/preview', { strategyId, ids, expectedRevision: strategy.revision }, { timeout: 120000 })).data); }
          catch (e) { setError((e as Error).message); }
          finally { setChecking(false); }
        })}>{currentPreview ? 'Check again' : 'Inspect buy & sell rules'}</Button></div>
        {currentPreview && <section aria-label="Saved candle rule results" className="mt-5"><Alert type="info" showIcon title="Stored candle results · no orders placed" description={`Checked ${new Date(currentPreview.checkedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. A condition match is not a live trade instruction. Expand a stock to see the individual checks.`} />
          <Table<Result> size="small" rowKey="id" dataSource={currentPreview.results} pagination={{ pageSize: 10 }} scroll={{ x: 750 }} columns={[
            { title: 'Stock', dataIndex: 'symbol' }, { title: 'Candle closed (IST)', dataIndex: 'barEnd', render: value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'No stored candle' },
            { title: 'Buy rules · when not held', render: (_, row) => verdict(row.entry.matched) }, { title: 'Sell rules · when held', render: (_, row) => verdict(row.exit.matched) },
          ]} expandable={{ expandedRowRender: row => <Space orientation="vertical">{(['entry', 'exit'] as const).map(side => <div key={side}><strong>{side === 'entry' ? 'Buy checks' : 'Sell checks'}</strong>{row[side].checks.map((check, i) => <p key={i}>{verdict(check.matched)} {check.field}{check.left == null ? '' : ': ' + check.left.toFixed(2)}{check.right == null ? '' : ' / comparison ' + check.right.toFixed(2)} {check.reason}</p>)}</div>)}</Space> }} />
        </section>}
        <Collapse className="mt-5" items={[{ key: 'monitor', label: 'Next: set up continuous paper monitoring', children: <>
          <p>Monitoring waits for new completed candles and a fresh execution feed. All orders use simulated cash. Protective stops, targets and session exits run automatically in both modes.</p>
          {!currentPreview && <p className="muted">Inspect this strategy and stock selection above before starting monitoring.</p>}
          <RhfSelect control={form.control} name="mode" label="After a new buy or sell signal" options={[{ value: 'confirmation', label: 'Ask me to confirm each paper trade' }, { value: 'automatic', label: 'Execute paper trades automatically' }]} />
          <Button htmlType="submit" loading={form.formState.isSubmitting} disabled={!strategy || !validScope || !currentPreview || monitoring || checking}>{monitoring ? 'Paper session already active' : 'Start paper monitoring'}</Button>
        </> }]} />
      </Form>
    </Card>
  </div>;
}
