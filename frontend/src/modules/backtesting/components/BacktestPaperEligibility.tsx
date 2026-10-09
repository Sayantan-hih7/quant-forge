import { GuidanceNote } from '../../../components/feedback/GuidanceNote';
import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Checkbox,InputNumber,Select,Space,Table,Tag} from 'antd';
import {useNavigate} from 'react-router-dom';
import {apiClient} from '../../../services/apiClient';
import type {BackendBacktest} from '../types/backend';
export interface EligibilitySettings {criteria:{minWinRate:number;minClosedTrades:number;minNetPnl:number;maxClosedDrawdown?:number};validationReportId?:string}
interface Metrics {instrumentId:string;symbol:string;closedTrades:number;wins:number;winRate:number|null;netPnl:number;closedDrawdown:number}
interface Assessment {settings:EligibilitySettings;assessedAt:string;blockers:string[];eligibleIds:string[];rows:(Metrics&{eligible:boolean;reasons:string[];validation?:Metrics})[];existingSession:{id:string;revision:number;mode:string}|null;validated:boolean}
const defaults:EligibilitySettings={criteria:{minWinRate:55,minClosedTrades:10,minNetPnl:0}};
const money=(n:number)=>`INR ${n.toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export function BacktestPaperEligibility({run}:{run:BackendBacktest}){
 const navigate=useNavigate();
 const [settings,setSettings]=useState<EligibilitySettings>(run.paperEligibilitySettings??defaults),[assessment,setAssessment]=useState<Assessment>(),[reports,setReports]=useState<BackendBacktest[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[mode,setMode]=useState<'confirmation'|'automatic'>('confirmation'),[ack,setAck]=useState(false);
 const serial=useRef(0),key=JSON.stringify(settings),[assessedKey,setAssessedKey]=useState('');
 useEffect(()=>{const controller=new AbortController();void apiClient.get<BackendBacktest[]>('/backtests',{params:{strategyId:run.strategy._id},signal:controller.signal}).then(r=>setReports(r.data.filter(r=>r.status==='completed'&&r.strategy.revision===run.strategy.revision&&Date.parse(r.config.from)>=Date.parse(run.config.to)))).catch(()=>{});return()=>controller.abort();},[run._id,run.strategy._id,run.strategy.revision,run.config.to]);
 useEffect(()=>{const controller=new AbortController(),request=++serial.current;const timer=setTimeout(()=>{void apiClient.post<Assessment>(`/backtests/${run._id}/paper-eligibility`,settings,{signal:controller.signal}).then(r=>{if(!controller.signal.aborted&&request===serial.current){setAssessment(r.data);setAssessedKey(key);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});},300);return()=>{clearTimeout(timer);controller.abort();};},[run._id,key,settings]);
 const fresh=assessedKey===key,existing=assessment?.existingSession,wrongRevision=!!existing&&existing.revision!==run.strategy.revision;
 const update=(field:keyof EligibilitySettings['criteria'],value:number|null)=>{setSettings(s=>({...s,criteria:{...s.criteria,[field]:value??undefined}}));setNotice('');};
 const apply=async()=>{if(!assessment||!fresh||busy)return;setBusy(true);setError('');try{
  const latest=(await apiClient.post<Assessment>(`/backtests/${run._id}/paper-eligibility`,settings)).data;setAssessment(latest);
  if(latest.blockers.length||!latest.eligibleIds.length)throw new Error(latest.blockers.join('. ')||'No stocks pass these filters.');
  if(latest.existingSession){
   if(latest.existingSession.revision!==run.strategy.revision)throw new Error('The active session uses an older revision. Close positions and stop that session before starting this revision.');
   await apiClient.patch(`/paper/sessions/${latest.existingSession.id}/configuration`,{ids:latest.eligibleIds,sourceBacktestId:run._id,eligibility:settings});
  }else await apiClient.post('/paper/sessions',{strategyId:run.strategy._id,expectedRevision:run.strategy.revision,ids:latest.eligibleIds,mode,sourceBacktestId:run._id,eligibility:settings});
  navigate('/paper-trading');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section aria-label="Paper trading eligibility">
 <h3>Choose stocks using backtest evidence</h3><p>Defaults are starting points, not proven optimal thresholds. Only completed positions count; partial exits are combined and costs are included. Passing these filters never places an immediate buy.</p>
 <Space wrap align="start">
 <label>Minimum win rate (%)<br/><InputNumber aria-label="Minimum win rate" min={0} max={100} value={settings.criteria.minWinRate} disabled={busy} onChange={v=>update('minWinRate',v??55)}/></label>
 <label>Minimum closed trades<br/><InputNumber aria-label="Minimum closed trades" min={1} max={10000} precision={0} value={settings.criteria.minClosedTrades} disabled={busy} onChange={v=>update('minClosedTrades',v??10)}/></label>
 <label>Minimum net profit (INR)<br/><InputNumber aria-label="Minimum net profit" min={0} value={settings.criteria.minNetPnl} disabled={busy} onChange={v=>update('minNetPnl',v??0)}/></label>
 <label>Maximum closed-trade drawdown (INR, optional)<br/><InputNumber aria-label="Maximum closed-trade drawdown" min={0.01} value={settings.criteria.maxClosedDrawdown} disabled={busy} onChange={v=>update('maxClosedDrawdown',v)}/></label>
 </Space><p className="muted">Net profit must be positive. Closed-trade drawdown measures declines in cumulative P&amp;L at completed exits; it does not capture intratrade losses or unrealized exposure.</p>
 <label>Separate later validation backtest<br/><Select aria-label="Validation backtest" allowClear disabled={busy} style={{width:450,maxWidth:'100%'}} placeholder="Optional: choose a later, non-overlapping report" value={settings.validationReportId} onChange={id=>{setSettings(s=>({...s,validationReportId:id}));setAck(false);}} options={reports.map(r=>({value:r._id,label:`${r.config.from.slice(0,10)} to ${new Date(Date.parse(r.config.to)-1).toLocaleDateString('en-IN')} - revision ${r.strategy.revision}`}))}/></label>
 <p>Validation applies the same thresholds to a later report of the same strategy revision. Run that period separately if none is listed. Avoid retuning against the validation results.</p>
 {!settings.validationReportId&&<Checkbox checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}>I understand this selects historical winners from the same test period. This shortlist is exploratory and not independently validated.</Checkbox>}
 {error&&<RequestFeedback type="error" showIcon title="Eligibility could not be applied" description={error}/>}
 {assessment&&<><p role="status">{fresh?`${assessment.eligibleIds.length} eligible / ${assessment.rows.length} tested stocks`:'Updating eligibility...'}</p>{assessment.blockers.map(b=><Alert key={b} type="warning" title={b}/>)}
 <Table size="small" rowKey="instrumentId" dataSource={[...assessment.rows].sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.closedTrades-a.closedTrades||a.symbol.localeCompare(b.symbol))} pagination={{pageSize:10}} scroll={{x:850}} columns={[
 {title:'Stock',dataIndex:'symbol'},{title:'Closed trades',dataIndex:'closedTrades'},{title:'Win rate',render:(_,r)=>r.winRate===null?'No closed trades':`${r.winRate.toFixed(1)}%`},{title:'Closed net P&L',render:(_,r)=>money(r.netPnl)},{title:'Closed drawdown',render:(_,r)=>money(r.closedDrawdown)},{title:'Eligibility',render:(_,r)=><><Tag color={r.eligible?'green':'default'}>{r.eligible?'Eligible':'Not eligible'}</Tag><div>{r.reasons.join('; ')}</div>{r.validation&&<small>Validation: {r.validation.closedTrades} trades, {r.validation.winRate?.toFixed(1)??'n/a'}% wins, {money(r.validation.netPnl)}</small>}</>}
 ]}/>
 {!assessment.eligibleIds.length&&fresh&&<GuidanceNote type="info" title="No stocks pass these filters" description="Inspect the reasons or test a longer period. Thresholds are never relaxed automatically to create trades."/>}
 </>}
 <Space wrap style={{marginTop:16}}><Button disabled={busy||!fresh||!assessment} onClick={async()=>{setBusy(true);try{await apiClient.put(`/backtests/${run._id}/paper-eligibility`,settings);setNotice('Filters saved with this report.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Save filters</Button>
 {!existing&&<Select aria-label="Eligible stocks paper mode" value={mode} onChange={setMode} disabled={busy} options={[{value:'confirmation',label:'Confirm each paper entry'},{value:'automatic',label:'Automatic paper trades'}]}/>}
 <Button type="primary" loading={busy} disabled={busy||!fresh||!assessment?.eligibleIds.length||!!assessment?.blockers.length||wrongRevision||(!settings.validationReportId&&!ack)} onClick={()=>void apply()}>{existing?'Apply eligible stocks to existing session':'Start paper trading with eligible stocks'}</Button>
 </Space>{notice&&<p role="status">{notice}</p>}
 {wrongRevision&&<Alert type="warning" title="Existing paper session uses a different revision" description="Close its positions and stop that session before starting the revision tested here. The app will not replace its rules automatically."/>}
 <p className="muted">The selected list stays fixed until you refresh it. Current qualification, fresh signals, market hours and risk limits still apply. Updating an existing session preserves its mode, cash and held-position protection; pending buys for removed stocks are cancelled. Paper trading only.</p>
 </section>;
}
