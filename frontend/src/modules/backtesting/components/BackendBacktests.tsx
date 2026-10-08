import { defaultBacktestSelection, BACKTEST_STOCK_LIMIT } from '../../strategies/utils/backtestSelection';
import { BacktestSelectionAudit } from './BacktestSelectionAudit';
import { useExchangePreference, exchangeOptions } from '../../qualification/hooks/useExchangePreference';
import { BacktestStockSuitability } from './BacktestStockSuitability';
import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Collapse, Col, Drawer, Form, Progress, Row, Select, Space, Table, Tabs, Tag } from 'antd';
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
import { FixedPriceNotice } from '../../strategies/components/FixedPriceNotice';
import type { BackendBacktest } from '../types/backend';
import { BackendBacktestReport } from './BackendBacktestReport';

const dayMs = 86400000;
type Fields = z.infer<ReturnType<typeof backtestSetupSchema>>;
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const range = (days: number) => { const end = Date.now() + 19_800_000 - dayMs; return { to: new Date(end).toISOString().slice(0, 10), from: new Date(end - (days - 1) * dayMs).toISOString().slice(0, 10) }; };

export function BackendBacktests({ strategies, selected, initialRunId, onReportClose }: { strategies: SavedStrategy[]; selected: string; initialRunId?:string; onReportClose?:()=>void }) {
  const [workspaceTab, setWorkspaceTab] = useState('setup');
  const strategy = strategies.find(s => s._id === selected), daily = strategy?.entry.cadence === 'daily';
  const { message } = App.useApp(), [runs, setRuns] = useState<BackendBacktest[]>([]), [report, setReport] = useState<BackendBacktest>(), [error, setError] = useState<string>(), [submitError, setSubmitError] = useState<string>(), [pending, setPending] = useState<string>(), [reportLoading, setReportLoading] = useState<string|undefined>(initialRunId);
  const form = useForm<Fields>({ resolver: zodResolver(backtestSetupSchema(daily)), defaultValues: { strategyId: selected, ...range(daily ? 365 : 30), universe: 'current', dataPolicy:'ready', includeManual: true, acknowledgeSelectionBias: false, ids: [] } });
  const values = useWatch({ control: form.control }) as Fields;
  const {exchange,setExchange}=useExchangePreference();
  const loadedScope = useQualifiedStockScope({...values,suitability:true});
  const scope={...loadedScope,stocks:loadedScope.stocks.filter(stock=>exchange==='all'||stock.exchange===exchange)};
  const initializedScope=useRef<string|undefined>(undefined);
  const scopeKey=`${exchange}:${selected}:${values.universe}:${values.includeManual}:${values.universe==='historical'?`${values.from}:${values.to}`:''}`;
  useEffect(()=>{
    if(scope.loading||scope.error||initializedScope.current===scopeKey)return;
    initializedScope.current=scopeKey;
    form.setValue('ids',defaultBacktestSelection(scope.stocks,strategy?.entry.horizon,values.universe==='historical'),{shouldValidate:false});
  },[scope.loading,scope.error,scope.stocks,scopeKey,form,strategy?.entry.horizon,values.universe]);
  const eligible = new Set(scope.stocks.map(s => s._id));
  const validScope = !scope.loading && !scope.error && values.ids.length > 0 && values.ids.length <= BACKTEST_STOCK_LIMIT && values.ids.every(id => eligible.has(id));
  const refresh = useCallback(() => apiClient.get<BackendBacktest[]>('/backtests', { params: { strategyId: selected } }).then(response => {
    setRuns(response.data.filter(run => run.strategy._id === selected)); setError(undefined);
    setPending(current => response.data.some(run => run._id === current && ['completed', 'failed'].includes(run.status)) ? undefined : current);
  }).catch(e => { setError((e as Error).message); }), [selected]);
  const reportRequest=useRef(0);
  useEffect(()=>()=>{reportRequest.current++;},[]);
  const openReport = useCallback((id: string) => {
    const request=++reportRequest.current;
    return apiClient.get<BackendBacktest>('/backtests/' + id).then(({data})=>{
      if(request!==reportRequest.current)return;
      if(data.strategy._id!==selected)throw new Error('This backtest belongs to a different strategy.');
      setReport(data); setWorkspaceTab('history');
    }).catch(e=>{if(request===reportRequest.current)message.error((e as Error).message);})
      .finally(()=>{if(request===reportRequest.current)setReportLoading(undefined);});
  }, [message,selected]);
  useEffect(()=>{if(initialRunId)void openReport(initialRunId);},[initialRunId,openReport]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000); return () => clearInterval(timer); }, [refresh]);
  if (!strategy) return <Alert type="info" title="Save a strategy before backtesting" />;
  const activeRun = runs.find(r => ['queued', 'running'].includes(r.status));
  return <div className="backtest-workflow">
    <div className="bt-setup-heading"><div><strong>{strategy.name}</strong><span>Revision {strategy.revision} · {strategy.entry.horizon} · Historical simulation</span></div></div>
    <Collapse className="bt-strategy-context" ghost items={[{key:'strategy',label:'View saved rules, risk & costs',children:<StrategySummaryStrip strategy={strategy} revision={strategy.revision}/>}]} />
    <Tabs activeKey={strategy.archivedAt ? 'history' : workspaceTab} onChange={setWorkspaceTab} items={[...(!strategy.archivedAt ? [{key:'setup',label:'New backtest'}] : []),{key:'history',label:`Run history (${runs.length})`}]} />
    {(activeRun || pending) && workspaceTab === 'setup' && <Alert showIcon type="info" title={activeRun?.stage === 'preparing' ? 'Preparing price history' : 'Backtest in progress'} description={activeRun?.message} action={<Button size="small" onClick={() => setWorkspaceTab('history')}>View progress</Button>}/>}
    <div hidden={workspaceTab !== 'setup' || !!strategy.archivedAt}>
    {!strategy.archivedAt&&<Card title="Set up a backtest" extra={<Tag>Historical replay</Tag>}>
      <Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit(async input => {
        if (!validScope) { setSubmitError('Choose stocks belonging to the loaded universe before running.'); return; }
        setSubmitError(undefined);
        try { const response = await apiClient.post<{ id: string }>('/backtests', { ...input, expectedRevision: strategy.revision }); setPending(response.data.id); setWorkspaceTab('history'); message.info('Backtest queued. Follow preparation and replay in Run history.'); await refresh(); }
        catch (e) { setSubmitError((e as Error).message); }
      })}>
        <div className="backtest-config-grid"><section><h3>1. Choose a period</h3><p>Use completed dates. {daily ? 'Daily strategies support up to five years.' : 'Intraday checks support up to 90 days per run.'}</p>
          <Space className="mb-5" wrap>{(daily ? [30, 90, 365] : [30, 90]).map(days => <Button size="small" key={days} onClick={() => { const next = range(days); form.setValue('from', next.from, { shouldValidate: true }); form.setValue('to', next.to, { shouldValidate: true }); }}>Last {days === 365 ? 'year' : `${days} days`}</Button>)}</Space>
          <Row gutter={16}><Col xs={24} sm={12}><RhfInput control={form.control} name="from" label="From" type="date" max={range(1).to} /></Col><Col xs={24} sm={12}><RhfInput control={form.control} name="to" label="Through" type="date" max={range(1).to} /></Col></Row>
          <RhfSelect control={form.control} name="universe" label="Which qualified list?" options={[{ value: 'current', label: 'Current list · research on past prices' }, { value: 'historical', label: 'Historical lists · as published at that time' }]} />
          {values.universe === 'current' ? <><p className="strategy-context-note">Today's stock selection uses information that was not available in the past. This tests trading behaviour; it does not validate historical stock selection.</p><Controller control={form.control} name="acknowledgeSelectionBias" render={({ field, fieldState }) => <Form.Item validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}><Checkbox checked={field.value} onChange={e => field.onChange(e.target.checked)}>I understand this uses today's list for research</Checkbox></Form.Item>} /></> : <p className="strategy-context-note">Only stocks recorded in published lists during this period are offered. Each stock becomes eligible from its recorded publication time.</p>}
        </section><section><h3>2. Choose stocks to replay</h3><p>Up to 200 qualified stocks from your chosen exchange are selected by default, including manual additions. Changing exchange resets the selection.</p>
          <Select aria-label="Backtest exchange" value={exchange} onChange={setExchange} options={exchangeOptions} style={{width:180,marginBottom:16}} />
          <Controller control={form.control} name="includeManual" render={({ field }) => <Checkbox className="mb-5" checked={field.value} onChange={e => field.onChange(e.target.checked)}>Include manually added stocks</Checkbox>} />
          <Controller control={form.control} name="ids" render={({ field, fieldState }) => <QualifiedStockPicker {...scope} maxStocks={BACKTEST_STOCK_LIMIT} horizon={strategy.entry.horizon} historical={values.universe==='historical'} value={field.value} onChange={field.onChange} validationError={fieldState.error?.message} onRetry={scope.retry} />} />
          <BacktestStockSuitability stocks={scope.stocks} value={values.ids} horizon={strategy.entry.horizon} historical={values.universe==='historical'} loading={scope.loading} onChange={ids=>form.setValue('ids',ids,{shouldValidate:true})} />
          <RhfSelect control={form.control} name="dataPolicy" label="Data readiness" options={[{value:'ready',label:'Test data-ready stocks (recommended)'},{value:'all',label:'Include all selected stocks - research'}]}/>
          <p className="muted">Downloads are retried first. Data-ready mode requires complete recorded sessions and strategy inputs at the first decision candle. New listings may need a later start date. Every exclusion is recorded; selecting by data coverage can bias results.</p>
          <FixedPriceNotice risk={strategy.risk} selectedCount={values.ids.length} />
          <p className="muted">Capital, stops, targets and cost estimates come from the saved strategy shown above. Buy and sell rules are tested together.</p>
        </section></div>
        {submitError && <Alert className="mb-5" type="error" showIcon title="Backtest could not start" description={submitError} />}
        <div className="runner-actions"><div><strong>{values.ids.length} stocks selected · saved rules only</strong><p>Missing history is downloaded first, then completed candles are replayed. This can take time; you can leave this page and return to the run.</p></div><Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={!validScope || !!activeRun || !!pending}>{activeRun || pending ? 'Backtest in progress' : 'Run backtest'}</Button></div>
      </Form>
    </Card>
    }
    </div>
    <div hidden={!strategy.archivedAt && workspaceTab !== 'history'}>
    <Card title="Runs for this strategy" extra={<Button onClick={() => void refresh()}>Refresh runs</Button>}>
      {error && <Alert className="mb-5" type="error" showIcon title="Runs could not be loaded" description={error} />}
      <Table<BackendBacktest> size="small" rowKey="_id" dataSource={runs} pagination={{ pageSize: 5 }} locale={{ emptyText: 'No backtests yet. Open New backtest to choose dates and stocks.' }} scroll={{ x: 850 }} columns={[
        { title: 'Test period', render: (_, r) => <div>{date(r.config.from)} – {date(new Date(Date.parse(r.config.to) - 1).toISOString())}<div className="muted">{r.config.ids.length} stocks · {r.strategy.revision === strategy.revision ? 'Current saved rules' : `Earlier rules · revision ${r.strategy.revision}`}<div><StrategyHistoryButton strategy={r.strategy} context="This backtest" /></div></div></div> },
        { title: 'Status', render: (_, r) => <Tag color={r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : 'blue'}>{r.status === 'running' ? r.stage === 'preparing' ? 'Preparing history' : 'Replaying candles' : r.status}</Tag> },
        { title: 'Progress / details', render: (_, r) => <div style={{ maxWidth: 380 }}>{r.status === 'running' && r.stage === 'preparing' && r.progress && <Progress percent={r.progress.total ? Math.min(100, Math.round(r.progress.processed / r.progress.total * 100)) : 0} size="small" />}<small>{r.message ?? (r.status === 'completed' ? 'Report ready' : 'Waiting for worker')}</small></div> },
        { title: 'Report', render: (_, r) => <Button disabled={r.status !== 'completed' && !r.selectionAudit} loading={reportLoading === r._id} onClick={() => {setReportLoading(r._id);void openReport(r._id);}}>View report</Button> },
      ]} />
    </Card>
    </div>
    <Drawer className="backtest-report-drawer bt-report-fullscreen" title="Backtest report" open={!!report} size="100vw" onClose={() => {reportRequest.current++;setReport(undefined);setReportLoading(undefined);onReportClose?.();}} destroyOnHidden>{report && <>{report.strategy.revision !== strategy.revision && <Alert className="mb-5" type="warning" showIcon title="This report tested an earlier set of rules" description="The strategy has changed since this run. Run another backtest to evaluate the current saved rules." />}{report.status==='completed'?<BackendBacktestReport key={report._id} run={report} />:<><Alert type="info" title={`Backtest ${report.status}`} description={report.message??'The report is available when this run completes.'} /><BacktestSelectionAudit run={report}/><StrategyHistoryButton strategy={report.strategy} context="This backtest" /></>}</>}</Drawer>
  </div>;
}
