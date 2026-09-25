import { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Col, Drawer, Form, Progress, Row, Space, Table, Tag } from 'antd';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { backtestSetupSchema } from '../schemas/backendBacktestSchema';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { useQualifiedStockScope } from '../../strategies/hooks/useQualifiedStockScope';
import { QualifiedStockPicker } from '../../strategies/components/QualifiedStockPicker';
import { StrategySummaryStrip } from '../../strategies/components/StrategySummaryStrip';
import type { BackendBacktest } from '../types/backend';
import { BackendBacktestReport } from './BackendBacktestReport';

const dayMs = 86400000;
type Fields = z.infer<ReturnType<typeof backtestSetupSchema>>;
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const range = (days: number) => { const end = Date.now() + 19_800_000 - dayMs; return { to: new Date(end).toISOString().slice(0, 10), from: new Date(end - (days - 1) * dayMs).toISOString().slice(0, 10) }; };

export function BackendBacktests({ strategies, selected }: { strategies: SavedStrategy[]; selected: string }) {
  const strategy = strategies.find(s => s._id === selected), daily = strategy?.entry.cadence === 'daily';
  const { message } = App.useApp(), [runs, setRuns] = useState<BackendBacktest[]>([]), [report, setReport] = useState<BackendBacktest>(), [error, setError] = useState<string>(), [submitError, setSubmitError] = useState<string>(), [pending, setPending] = useState<string>(), [reportLoading, setReportLoading] = useState<string>();
  const form = useForm<Fields>({ resolver: zodResolver(backtestSetupSchema(daily)), defaultValues: { strategyId: selected, ...range(daily ? 365 : 30), universe: 'current', includeManual: false, acknowledgeSelectionBias: false, ids: [] } });
  const values = useWatch({ control: form.control }) as Fields;
  const scope = useQualifiedStockScope(values);
  const eligible = new Set(scope.stocks.map(s => s._id));
  const validScope = !scope.loading && !scope.error && values.ids.every(id => eligible.has(id));
  const refresh = useCallback(() => apiClient.get<BackendBacktest[]>('/backtests', { params: { strategyId: selected } }).then(response => {
    setRuns(response.data.filter(run => run.strategy._id === selected)); setError(undefined);
    setPending(current => response.data.some(run => run._id === current && ['completed', 'failed'].includes(run.status)) ? undefined : current);
  }).catch(e => { setError((e as Error).message); }), [selected]);
  const openReport = useCallback(async (id: string) => {
    setReportLoading(id);
    try { const response = await apiClient.get<BackendBacktest>('/backtests/' + id); setReport(response.data); }
    catch (e) { message.error((e as Error).message); }
    finally { setReportLoading(undefined); }
  }, [message]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000); return () => clearInterval(timer); }, [refresh]);
  if (!strategy) return <Alert type="info" title="Save a strategy before backtesting" />;
  const activeRun = runs.find(r => ['queued', 'running'].includes(r.status));
  return <div className="backtest-workflow">
    <StrategySummaryStrip strategy={strategy} revision={strategy.revision} />
    <Card title="Set up a backtest" extra={<Tag>Historical replay</Tag>}>
      <Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit(async input => {
        if (!validScope) { setSubmitError('Choose stocks belonging to the loaded universe before running.'); return; }
        setSubmitError(undefined);
        try { const response = await apiClient.post<{ id: string }>('/backtests', { ...input, expectedRevision: strategy.revision }); setPending(response.data.id); message.info('Backtest queued. Data preparation and replay progress will appear below.'); await refresh(); }
        catch (e) { setSubmitError((e as Error).message); }
      })}>
        <div className="backtest-config-grid"><section><h3>1. Choose a period</h3><p>Use completed dates. {daily ? 'Daily strategies support up to five years.' : 'Intraday checks support up to 90 days per run.'}</p>
          <Space className="mb-5" wrap>{(daily ? [30, 90, 365] : [30, 90]).map(days => <Button size="small" key={days} onClick={() => { const next = range(days); form.setValue('from', next.from, { shouldValidate: true }); form.setValue('to', next.to, { shouldValidate: true }); }}>Last {days === 365 ? 'year' : `${days} days`}</Button>)}</Space>
          <Row gutter={16}><Col xs={24} sm={12}><RhfInput control={form.control} name="from" label="From" type="date" max={range(1).to} /></Col><Col xs={24} sm={12}><RhfInput control={form.control} name="to" label="Through" type="date" max={range(1).to} /></Col></Row>
          <RhfSelect control={form.control} name="universe" label="Which qualified list?" options={[{ value: 'current', label: 'Current list · research on past prices' }, { value: 'historical', label: 'Historical lists · as published at that time' }]} />
          {values.universe === 'current' ? <><p className="strategy-context-note">Today's stock selection uses information that was not available in the past. This tests trading behaviour; it does not validate historical stock selection.</p><Controller control={form.control} name="acknowledgeSelectionBias" render={({ field, fieldState }) => <Form.Item validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}><Checkbox checked={field.value} onChange={e => field.onChange(e.target.checked)}>I understand this uses today's list for research</Checkbox></Form.Item>} /></> : <p className="strategy-context-note">Only stocks recorded in published lists during this period are offered. Each stock becomes eligible from its recorded publication time.</p>}
        </section><section><h3>2. Choose stocks to replay</h3><p>Start with a small set to review the behaviour. Up to 100 stocks per run.</p>
          <Controller control={form.control} name="includeManual" render={({ field }) => <Checkbox className="mb-5" checked={field.value} onChange={e => field.onChange(e.target.checked)}>Include manually added stocks</Checkbox>} />
          <Controller control={form.control} name="ids" render={({ field, fieldState }) => <QualifiedStockPicker {...scope} value={field.value} onChange={field.onChange} validationError={fieldState.error?.message} onRetry={scope.retry} />} />
          <p className="muted">Capital, stops, targets and cost estimates come from the saved strategy shown above. Buy and sell rules are tested together.</p>
        </section></div>
        {submitError && <Alert className="mb-5" type="error" showIcon title="Backtest could not start" description={submitError} />}
        <div className="runner-actions"><div><strong>{values.ids.length} stocks selected · saved rules only</strong><p>Missing history is downloaded first, then completed candles are replayed. This can take time; you can leave this page and return to the run.</p></div><Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={!validScope || !!activeRun || !!pending}>{activeRun || pending ? 'Backtest in progress' : 'Run backtest'}</Button></div>
      </Form>
    </Card>
    <Card title="Runs for this strategy" extra={<Button onClick={() => void refresh()}>Refresh runs</Button>}>
      {error && <Alert className="mb-5" type="error" showIcon title="Runs could not be loaded" description={error} />}
      <Table<BackendBacktest> size="small" rowKey="_id" dataSource={runs} pagination={{ pageSize: 5 }} locale={{ emptyText: 'No backtests yet. Choose dates and stocks above to run the first test.' }} scroll={{ x: 850 }} columns={[
        { title: 'Test period', render: (_, r) => <div>{date(r.config.from)} – {date(new Date(Date.parse(r.config.to) - 1).toISOString())}<div className="muted">{r.config.ids.length} stocks · {r.strategy.revision === strategy.revision ? 'Current saved rules' : `Earlier rules · revision ${r.strategy.revision}`}</div></div> },
        { title: 'Status', render: (_, r) => <Tag color={r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : 'blue'}>{r.status === 'running' ? r.stage === 'preparing' ? 'Preparing history' : 'Replaying candles' : r.status}</Tag> },
        { title: 'Progress / details', render: (_, r) => <div style={{ maxWidth: 380 }}>{r.status === 'running' && r.progress && <Progress percent={r.progress.total ? Math.min(100, Math.round(r.progress.processed / r.progress.total * 100)) : 0} size="small" />}<small>{r.message ?? (r.status === 'completed' ? 'Report ready' : 'Waiting for worker')}</small></div> },
        { title: 'Report', render: (_, r) => <Button disabled={r.status !== 'completed'} loading={reportLoading === r._id} onClick={() => void openReport(r._id)}>View report</Button> },
      ]} />
    </Card>
    <Drawer className="backtest-report-drawer" title="Backtest report" open={!!report} size={1120} onClose={() => setReport(undefined)} destroyOnHidden>{report && <>{report.strategy.revision !== strategy.revision && <Alert className="mb-5" type="warning" showIcon title="This report tested an earlier set of rules" description="The strategy has changed since this run. Run another backtest to evaluate the current saved rules." />}<BackendBacktestReport run={report} /></>}</Drawer>
  </div>;
}
