import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Modal, Space, Tag } from 'antd';
import { apiClient } from '../../../services/apiClient';
import type { MonthlyCondition, MonthlyRuleDefinition } from '../types/monthly';
import { monthlyConditionSummary } from '../utils/monthlySummary';
interface Issue {id:string;severity:'error'|'warning'|'suggestion';title:string;explanation:string;recommendation:string;locations:{group:number;condition:number}[];fix?:{location:{group:number;condition:number};expectedCondition:MonthlyCondition}}
interface Report {issues:Issue[];positives:string[];history:{minimum:number;months:number};limitations:string[]}
export function MonthlyRuleReview({rule,onApply,visible=true}:{rule:MonthlyRuleDefinition;onApply:(rule:MonthlyRuleDefinition)=>void;visible?:boolean}) {
  const identity=JSON.stringify(rule),[state,setState]=useState<{identity:string;report?:Report;error?:string}>(),[attempt,setAttempt]=useState(0),[preview,setPreview]=useState<{identity:string;issue:Issue}>();
  useEffect(()=>{if(!visible)return;const abort=new AbortController();const timer=setTimeout(()=>{void apiClient.post<Report>('/qualification/rule/review',JSON.parse(identity),{signal:abort.signal}).then(({data})=>{if(!Array.isArray(data.issues)||!data.history||!Array.isArray(data.limitations))throw new Error('The server returned an incomplete rule review');if(!abort.signal.aborted)setState({identity,report:data});}).catch((e:Error)=>{if(!abort.signal.aborted)setState({identity,error:e.message});});},500);return()=>{clearTimeout(timer);abort.abort();};},[identity,attempt,visible]);
  const current=state?.identity===identity?state:undefined,report=current?.report;
  return <section className="monthly-review" aria-label="Monthly rule review">
    <div className="q-section-heading"><div><h3>Review before scanning</h3><p>Check the logic and the history your conditions need.</p></div><Tag color={report?.issues.some(i=>i.severity==='error')?'red':report?.issues.length?'gold':undefined}>{!current?'Checking…':current.error?'Unavailable':`${report?.issues.length??0} points to review`}</Tag></div>
    {current?.error&&<Alert type="warning" showIcon title="Rule review unavailable" description={current.error} action={<Button size="small" onClick={()=>setAttempt(x=>x+1)}>Retry review</Button>}/>}
    {report&&<><p className="muted">{report.history.minimum?`Longest technical requirement: ${report.history.minimum} completed monthly candles. Additional history is loaded to stabilise indicators. New listings wait until enough history exists.`:'These conditions use dated company or exchange reports. No technical candle history is required.'}</p>
      {!report.issues.length&&<Alert type="success" showIcon title="No conflict found by the supported checks" description="You can save this rule and scan. Data availability and qualifying stocks are checked during the scan."/>}
      {!!report.issues.length&&<Collapse items={report.issues.map(i=>({key:i.id,label:<Space><Tag color={i.severity==='error'?'red':i.severity==='warning'?'gold':'blue'}>{i.severity==='error'?'Needs attention':i.severity==='warning'?'Review':'Simplify'}</Tag>{i.title}</Space>,children:<><p>{i.explanation}</p><p className="muted">{i.recommendation}</p><p>{i.locations.map(l=>`Condition ${l.condition+1}${rule.groups.length>1?` in group ${l.group+1}`:''}`).join(' · ')}</p>{i.fix&&<Button size="small" onClick={()=>setPreview({identity,issue:i})}>Preview simplification</Button>}</>}))}/>}
      <p className="muted">{report.limitations.join(' ')}</p></>}
    <Modal open={!!preview} title="Simplify this draft?" onCancel={()=>setPreview(undefined)} okText="Apply to draft" okButtonProps={{disabled:preview?.identity!==identity}} onOk={()=>{const fix=preview?.issue.fix;if(!fix||preview?.identity!==identity)return;const next=structuredClone(rule),group=next.groups[fix.location.group];if(group.conditions.length<=1)return;group.conditions.splice(fix.location.condition,1);onApply(next);setPreview(undefined);}}>
      {preview?.issue.fix&&<><p>Remove: <strong>{monthlyConditionSummary(preview.issue.fix.expectedCondition)}</strong></p><p>{preview.issue.explanation}</p><p>Review and save to use the simplified rule. Your published list changes only after a new scan is reviewed and published.</p></>}
      {preview?.identity!==identity&&<Alert type="warning" title="The draft changed. Close this preview and review it again."/>}
    </Modal>
  </section>;
}
