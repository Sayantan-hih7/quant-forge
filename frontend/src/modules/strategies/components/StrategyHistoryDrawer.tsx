import { GuidanceNote } from '../../../components/feedback/GuidanceNote';
import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import { useEffect,useState } from 'react';
import { Alert,Button,Collapse,Drawer,Empty,Select,Space,Spin,Table,Tag } from 'antd';
import { Link } from 'react-router-dom';
import { apiClient } from '../../../services/apiClient';
import { StrategyDraftPreview } from './StrategyDraftPreview';
import { strategyChanges } from '../utils/strategyChanges';
import type { SavedStrategy } from '../hooks/useBackendStrategies';
import type { StrategyHistory,RevisionSnapshot } from '../types/strategyHistory';
import '../../../styles/strategy-history.css';

const when=(date?:string)=>date?new Date(date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Save date unavailable';
export function StrategyHistoryDrawer({strategyId,used,context,onClose}:{strategyId:string;used?:SavedStrategy;context?:string;onClose:()=>void}){
  const [data,setData]=useState<StrategyHistory>(),[error,setError]=useState<string>(),[attempt,setAttempt]=useState(0);
  const [selected,setSelected]=useState<number>(),[comparison,setComparison]=useState<number>();
  useEffect(()=>{
    const controller=new AbortController();
    void apiClient.get<StrategyHistory>(`/strategies/${strategyId}/revisions`,{signal:controller.signal}).then(({data})=>{
      if(!Array.isArray(data.revisions))throw new Error('Revision history returned an invalid response.');
      if(!controller.signal.aborted){setData(data);setError(undefined);}
    }).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);});
    return()=>controller.abort();
  },[strategyId,attempt]);
  const rows=data?.revisions??[],revision=selected??used?.revision??data?.currentRevision??rows[0]?.strategy.revision;
  const row=rows.find(r=>r.strategy.revision===revision);
  const snapshot=used?.revision===revision?used:row?.strategy;
  const defaultCompare=used&&revision===used.revision?data?.currentRevision:rows.find(r=>r.strategy.revision<(revision??0))?.strategy.revision;
  const compareRevision=comparison??(defaultCompare===revision?undefined:defaultCompare);
  const compare=rows.find(r=>r.strategy.revision===compareRevision)?.strategy;
  const before=snapshot&&compare?(snapshot.revision<compare.revision?snapshot:compare):undefined;
  const after=snapshot&&compare?(snapshot.revision<compare.revision?compare:snapshot):undefined;
  const changes=before&&after?strategyChanges(before,after):[];
  const options=rows.map(r=>({value:r.strategy.revision,label:`Revision ${r.strategy.revision}${r.strategy.revision===data?.currentRevision?' · Current':''} · ${when(r.strategy.savedAt)}`}));
  if(used&&!options.some(o=>o.value===used.revision))options.unshift({value:used.revision,label:`Revision ${used.revision} · Recorded snapshot`});
  return <Drawer open title="Strategy revision history" size={1120} onClose={onClose} className="strategy-history-drawer">
    {used&&<Alert className="mb-5" type={data?.currentRevision&&data.currentRevision!==used.revision?'warning':'info'} showIcon title={`${context??'This item'} uses revision ${used.revision}`} description={`The saved rules below are the snapshot used at the time.${data?.currentRevision?` Current saved revision: ${data.currentRevision}.`:''}`}/>}
    {!data&&!error&&<Spin aria-label="Loading revision history"/>}
    {error&&<RequestFeedback className="mb-5" type="error" showIcon title="Revision history could not be loaded" description={error} action={<Button onClick={()=>{setError(undefined);setAttempt(n=>n+1);}}>Retry history</Button>}/>}
    {data&&<>
      <div className="strategy-history-intro"><h3>{rows.find(r=>r.strategy.revision===data.currentRevision)?.strategy.name??snapshot?.name}</h3><p>{rows.length} recorded revisions · Times in IST. Select a revision to inspect or compare its saved rules.</p></div>
      {!!data.missingRanges.length&&<Alert className="mb-5" type="warning" showIcon title={`Historical snapshots unavailable: revisions ${data.missingRanges.join(', ')}`} description="Only genuinely recorded definitions can be displayed. Missing history is not reconstructed from today's rules."/>}
      {data.currentRevision===null&&<Alert type="info" title="The current strategy is unavailable. Recorded run snapshots remain viewable."/>}
      <Table<RevisionSnapshot> aria-label="Recorded strategy revisions" size="small" rowKey={r=>String(r.strategy.revision)} dataSource={rows} pagination={{pageSize:10,showSizeChanger:false,hideOnSinglePage:true}} scroll={{x:700,y:300}} rowClassName={r=>r.strategy.revision===revision?'strategy-revision-selected':''} columns={[
        {title:'Revision',render:(_,r)=><Button type="link" onClick={()=>{setSelected(r.strategy.revision);setComparison(undefined);}}>Revision {r.strategy.revision}{r.strategy.revision===data.currentRevision?' · Current':''}</Button>},
        {title:'Saved (IST)',render:(_,r)=>when(r.strategy.savedAt)},
        {title:'Changes from previous',render:(_,r)=>{const previous=rows.find(p=>p.strategy.revision===r.strategy.revision-1);const diff=previous?strategyChanges(previous.strategy,r.strategy):[];return previous?diff.length?<>{[...new Set(diff.map(d=>d.section))].join(', ')}<div className="muted">{diff.length} {diff.length===1?'change':'changes'}</div></>:'No effective rule changes':r.strategy.revision===1?'First saved definition':'Previous snapshot unavailable';}},
        {title:'Used by',render:(_,r)=><Space wrap><Tag>{r.uses.filter(u=>u.kind==='backtest').length} backtests</Tag><Tag>{r.uses.filter(u=>u.kind!=='backtest').length} sessions</Tag></Space>},
      ]}/>
      <div className="strategy-revision-controls"><label>Inspect revision<Select aria-label="Inspect revision" showSearch={{optionFilterProp:'label'}} value={revision} options={options} onChange={v=>{setSelected(v);setComparison(undefined);}}/></label><label>Compare with<Select aria-label="Compare with revision" allowClear placeholder="Choose a revision" showSearch={{optionFilterProp:'label'}} value={compareRevision||undefined} options={options.filter(o=>o.value!==revision)} onClear={()=>setComparison(0)} onChange={v=>setComparison(v??0)}/></label></div>
    </>}
    {snapshot&&<section aria-label={`Revision ${revision} details`}>
      <Space wrap className="mb-5"><h3>Revision {revision} · {snapshot.name}</h3><Tag>{when(snapshot.savedAt)} IST</Tag></Space>
      {row?.source!=='saved'&&row&&<GuidanceNote className="mb-5" type="info" title="Recovered from a recorded run snapshot" description="The separate revision archive was missing. These are the rules actually stored with a backtest or session."/>}
      {row?.inconsistent&&<Alert className="mb-5" type="warning" title="Different snapshots share this revision number" description={used?.revision===revision?'This view uses the exact snapshot from the selected report or session.':'The saved archive is shown when available. Open the affected report or session to inspect its exact snapshot.'}/>}
      {before&&after&&<div className="strategy-revision-comparison" aria-label="Strategy revision comparison"><h4>Changes from revision {before.revision} to revision {after.revision}</h4><p>Before is revision {before.revision}; after is revision {after.revision}.</p>{changes.length?<Table size="small" rowKey={(_,i)=>String(i)} pagination={false} scroll={{x:600}} dataSource={changes} columns={[{title:'Setting',render:(_,d)=><><strong>{d.label}</strong><div className="muted">{d.section}</div></>},{title:`Before · revision ${before.revision}`,dataIndex:'before'},{title:`After · revision ${after.revision}`,dataIndex:'after'}]}/>:<Alert type="info" showIcon title="No effective rule or risk changes between these revisions"/>}</div>}
      <Collapse className="mt-5" defaultActiveKey={compare?[]:['rules']} items={[
        {key:'rules',label:`Full saved rules · revision ${revision}`,children:<StrategyDraftPreview draft={snapshot} changed={false} saved/>},
        {key:'uses',label:`Backtests and sessions using revision ${revision} (${row?.uses.length??0})`,children:row?.uses.length?<ul className="strategy-revision-uses">{row.uses.map(u=><li key={`${u.kind}:${u.id}`}><span>{u.kind==='backtest'?'Backtest':u.kind==='signals'?'Signal monitoring':'Paper trading'} · {when(u.at)} · {u.status}</span><Link onClick={onClose} to={u.kind==='backtest'?`/strategies?tab=backtests&rule=${strategyId}&run=${u.id}`:`/${u.kind==='signals'?'signal-runner':'paper-trading'}?session=${u.id}`}>Open {u.kind==='backtest'?'report':'session'}</Link></li>)}</ul>:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recorded backtests or sessions for this revision"/>},
      ]}/>
    </section>}
  </Drawer>;
}
