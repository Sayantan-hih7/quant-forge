import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Collapse, Form, Space, Table, Tag } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfSelect } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { useQualifiedStockScope } from '../../strategies/hooks/useQualifiedStockScope';
import { QualifiedStockPicker } from '../../strategies/components/QualifiedStockPicker';
import { StrategySummaryStrip } from '../../strategies/components/StrategySummaryStrip';
import { FixedPriceNotice } from '../../strategies/components/FixedPriceNotice';
import type { PaperData, PaperSession, PaperObservation } from '../hooks/useBackendPaper';
import { ExecutionReadiness } from './ExecutionReadiness';
import type { BackendBacktest } from '../../backtesting/types/backend';
import '../../../styles/strategy-workflow.css';

const schema=z.object({strategyId:z.string().uuid('Choose a saved strategy'),ids:z.array(z.string()).min(1,'Choose at least one qualified stock').max(200,'Choose up to 200 stocks'),mode:z.enum(['signals','confirmation','automatic'])});
interface Preview {strategyId:string;revision:number;results:(PaperObservation&{id:string;symbol:string})[]}
const verdict=(matched:boolean|null)=><Tag color={matched===null?'gold':matched?'green':'default'}>{matched===null?'Data unavailable':matched?'Met':'Not met'}</Tag>;
export function RunnerSetup({strategies,sessions,paper,statusError,onStarted}:{strategies:SavedStrategy[];sessions:PaperSession[];paper?:PaperData;statusError?:string;onStarted:(id:string)=>Promise<void>}){
  const [params]=useSearchParams(),{message}=App.useApp(),backtestId=params.get('backtest');
  const [handoff,setHandoff]=useState<BackendBacktest>(),[loadError,setLoadError]=useState<string>(),[error,setError]=useState<string>(),[preview,setPreview]=useState<Preview>(),[checking,setChecking]=useState(false);
  const form=useForm<z.infer<typeof schema>>({resolver:zodResolver(schema),defaultValues:{strategyId:params.get('strategy')??strategies[0]?._id??'',ids:[],mode:backtestId?'confirmation':'signals'}});
  const values=useWatch({control:form.control}) as z.infer<typeof schema>,scope=useQualifiedStockScope({universe:'current',includeManual:true});
  const initialized=useRef(false),strategy=strategies.find(s=>s._id===values.strategyId),existing=sessions.find(s=>s.active&&s.strategy._id===values.strategyId);
  useEffect(()=>{if(!backtestId&&!form.getValues('strategyId')&&strategies[0])form.setValue('strategyId',strategies[0]._id);},[backtestId,strategies,form]);
  useEffect(()=>{if(!backtestId)return;const c=new AbortController();void apiClient.get<BackendBacktest>('/backtests/'+backtestId,{signal:c.signal}).then(r=>{if(!c.signal.aborted){setHandoff(r.data);form.setValue('strategyId',r.data.strategy._id);}}).catch(e=>{if(!c.signal.aborted)setLoadError(e.message);});return()=>c.abort();},[backtestId,form]);
  useEffect(()=>{if(initialized.current||scope.loading||scope.error||(backtestId&&!handoff))return;initialized.current=true;const available=new Set(scope.stocks.map(s=>s._id));form.setValue('ids',handoff?handoff.config.ids.filter(id=>available.has(id)):scope.stocks.map(s=>s._id));},[scope.loading,scope.error,scope.stocks,backtestId,handoff,form]);
  const currentPreview=preview?.strategyId===strategy?._id&&preview?.revision===strategy?.revision&&preview?.results.map(r=>r.id).sort().join(',')===[...values.ids].sort().join(',')?preview:undefined;
  const linked=!!backtestId,changed=linked&&!!handoff&&(handoff.status!=='completed'||strategy?._id!==handoff.strategy._id||strategy?.revision!==handoff.strategy.revision);
  const validScope=!scope.loading&&!scope.error&&values.ids.length>0&&values.ids.every(id=>scope.stocks.some(s=>s._id===id));
  const selectedOutsideTest=!!handoff&&values.ids.some(id=>!handoff.config.ids.includes(id));
  return <Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit(async input=>{
    if(!strategy||!validScope||changed||selectedOutsideTest||!paper?.workerRunning||statusError)return;
    setError(undefined);try{const response=await apiClient.post<{_id:string}>('/paper/sessions',{...input,expectedRevision:strategy.revision,...(linked?{sourceBacktestId:backtestId}:{})});await onStarted(response.data._id);message.success('Monitoring started. Live data connects automatically.');}catch(e){setError((e as Error).message);}
  })}>
    {linked&&<Alert className="mb-5" type={changed||loadError?'warning':'info'} showIcon title={changed?'Strategy changed since this backtest':loadError?'Backtest could not be loaded':handoff?'Using the strategy and stocks from your backtest':'Loading backtest'} description={loadError??(changed?'Backtest the current saved rules before continuing from this report.':handoff?`${handoff.config.ids.length} stocks tested. ${handoff.config.ids.filter(id=>!scope.stocks.some(s=>s._id===id)).length} are no longer qualified and excluded. New trades use current market signals; historical trades are not copied.`:'Please wait.')} />}
    <RhfSelect name="strategyId" control={form.control} label="Strategy" disabled={linked} options={strategies.filter(s=>!s.archivedAt).map(s=>({value:s._id,label:s.name}))}/>
    {strategy&&<div className="mb-5"><StrategySummaryStrip strategy={strategy} revision={strategy.revision}/></div>}
    <p>All qualified stocks are selected by default. A backtest handoff keeps its tested stock selection.</p>
    <Controller name="ids" control={form.control} render={({field,fieldState})=><QualifiedStockPicker {...scope} value={field.value} onChange={field.onChange} validationError={fieldState.error?.message} onRetry={scope.retry}/>}/>
    {selectedOutsideTest&&<Alert type="warning" title="Some selected stocks were not tested in this report" description="Remove those stocks or backtest the wider selection first." className="mb-5"/>}
    {strategy&&<FixedPriceNotice risk={strategy.risk} selectedCount={values.ids.length}/>}
    <RhfSelect name="mode" control={form.control} label="What should happen when rules match?" options={[{value:'signals',label:'Show buy / sell signals only'},{value:'confirmation',label:'Paper trade after I confirm'},{value:'automatic',label:'Paper trade automatically'}]}/>
    <p>{values.mode==='signals'?'Shows both buy and sell conditions for your watchlist. No paper orders are created. Sell alerts are for stocks you already hold.':'The app calculates shares from available paper cash, stop-loss risk and position limits. Stops, targets and sell rules manage held shares. No broker orders or real money.'}</p>
    <p className="muted">Signals use newly completed candles. Daily strategies wait for market close. Intraday strategies follow their saved candle interval. Backtest profits do not rank future buys.</p>
    <ExecutionReadiness data={paper} ids={values.ids} error={statusError}/>
    {error&&<Alert className="mt-5" type="error" showIcon title="Monitoring could not start" description={error}/>}
    <Space wrap className="mt-5"><Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={!!existing||!strategy||!validScope||changed||selectedOutsideTest||!!loadError||(linked&&!handoff)||!paper?.workerRunning||!!statusError}>{values.mode==='signals'?'Start signals':'Start paper trading'}</Button>{existing&&<Button onClick={()=>void onStarted(existing._id)}>Open existing monitoring</Button>}</Space>
    {existing&&<p className="muted">This strategy is already monitored using revision {existing.strategy.revision}. Use its settings to change stocks or execution mode. To use newer rules, close its positions and stop the existing session first.</p>}
    <Collapse className="mt-5" items={[{key:'inspect',label:'Optional: inspect the latest saved candle',children:<><p>This read-only check is not a new live signal.</p><Button loading={checking} disabled={!strategy||!validScope||!values.ids.length} onClick={async()=>{setChecking(true);setError(undefined);try{setPreview((await apiClient.post<Preview>('/paper/preview',{strategyId:values.strategyId,ids:values.ids,expectedRevision:strategy?.revision},{timeout:120000})).data);}catch(e){setError((e as Error).message);}finally{setChecking(false);}}}>Inspect buy &amp; sell rules</Button>{currentPreview&&<Table aria-label="Saved candle rule results" size="small" rowKey="id" dataSource={currentPreview.results} pagination={{pageSize:5}} columns={[{title:'Stock',dataIndex:'symbol'},{title:'Buy rules',render:(_,r)=>verdict(r.entry.matched)},{title:'Sell rules',render:(_,r)=>r.exit.disabled?<Tag>Stops & targets</Tag>:verdict(r.exit.matched)},{title:'Candle closed',render:(_,r)=>r.barEnd?new Date(r.barEnd).toLocaleString('en-IN'):'No candle'}]}/>}</>}]}/>
  </Form>;
}
