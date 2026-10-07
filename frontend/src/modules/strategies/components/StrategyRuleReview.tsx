import { useState } from 'react';
import { Alert, Button, Collapse, Modal, Space, Spin, Tag } from 'antd';
import { CheckCircleOutlined, SafetyOutlined, UndoOutlined } from '@ant-design/icons';
import type { useStrategyReview } from '../hooks/useStrategyReview';
import type { RuleReviewIssue } from '../types/ruleReview';
import type { TradingPlanDraft } from '../types/tradingPlan';
import { summarizeCondition } from '../../qualification/utils/ruleSummary';
import { AiRuleFix } from './AiRuleFix';
import { SuggestedRuleFix } from './SuggestedRuleFix';
import { applyRuleReviewFix } from '../utils/ruleReviewFixes';
import '../../../styles/strategy-review.css';

export function StrategyRuleReview({review,draft,compact=false,disabled=false,onOpen,onEdit,onApply,onUndo,canUndo=false}:{
  review:ReturnType<typeof useStrategyReview>;draft:TradingPlanDraft;compact?:boolean;disabled?:boolean;onOpen?:()=>void;
  onEdit:(section:RuleReviewIssue['section'])=>void;onApply:(issue:RuleReviewIssue,identity:string)=>void;onUndo:()=>void;canUndo?:boolean;
}){
  const [preview,setPreview]=useState<{issue:RuleReviewIssue;identity:string}>();
  const [guided,setGuided]=useState<{issue:RuleReviewIssue;draft:TradingPlanDraft;identity:string}>();
  const [aiFix,setAiFix]=useState<{issue:RuleReviewIssue;draft:TradingPlanDraft;identity:string}>();
  const [kept,setKept]=useState<{identity:string;ids:string[]}>();
  const report=review.report,errors=report?.issues.filter(i=>i.severity==='error').length??0,warnings=report?.issues.filter(i=>i.severity==='warning').length??0,suggestions=report?.issues.filter(i=>i.severity==='suggestion').length??0;
  const pending=preview?.identity===review.identity?preview:undefined,fix=pending?.issue.fix?.kind==='remove-condition'?pending.issue.fix:undefined;
  const group=fix?draft[fix.location.side].groups[fix.location.group]:undefined;
  const revised=pending?applyRuleReviewFix(draft,pending.issue):undefined;
  const title=review.validation?'Finish the required settings to review the logic':review.loading?'Checking your rules…':review.error?'Rule review is unavailable':errors?'Resolve conflicting rules':warnings?'Some settings need a closer look':suggestions?'Your rules can be simplified':'No conflict found in the supported checks';
  return <section className={`strategy-rule-review ${compact?'is-compact':''}`} aria-label="Strategy rule review">
    <div className="strategy-review-heading"><div><SafetyOutlined aria-hidden/><strong>{compact?title:'Rule health check'}</strong></div><Space wrap>{!review.loading&&report&&<><Tag color={errors?'red':'default'}>{errors} conflicts</Tag><Tag color={warnings?'gold':'default'}>{warnings} to review</Tag>{suggestions>0&&<Tag color="blue">{suggestions} simplifications</Tag>}</>}{compact&&<Button disabled={disabled} onClick={onOpen}>Review rules</Button>}{canUndo&&<Button disabled={disabled} icon={<UndoOutlined/>} onClick={onUndo}>Undo change</Button>}</Space></div>
    {!compact&&<>
      <p>Understand how your conditions work together before saving. This is a logic check, not a rating of likely returns.</p>
      {review.loading&&<div className="strategy-review-loading"><Spin size="small"/> Checking this draft…</div>}
      {review.validation&&<Alert type="info" showIcon title={title} description={review.validation}/>}
      {review.error&&<Alert type="warning" showIcon title={title} description="Existing field validation still applies. Retry to check interactions before relying on this review." action={<Button onClick={review.retry}>Retry review</Button>}/>}
      {report&&<>
        {!report.issues.length&&<Alert type="success" showIcon title={title} description="Backtest next to check trade frequency, costs, drawdowns and data coverage."/>}
        <div className="strategy-review-issues">{report.issues.map(issue=><article className={`strategy-review-issue ${issue.severity}`} key={issue.id}>
          <header><Tag color={issue.severity==='error'?'red':issue.severity==='warning'?'gold':'blue'}>{issue.severity==='error'?'Conflict':issue.severity==='warning'?'Review':'Simplify'}</Tag><strong>{issue.title}</strong></header>
          <p>{issue.explanation}</p>
          {issue.locations.length>0&&<ul>{issue.locations.map(at=>{const c=draft[at.side].groups[at.group]?.conditions[at.condition];return c?<li key={`${at.side}:${at.group}:${at.condition}`}><span>{at.side==='entry'?'Buy':'Sell'} · group {at.group+1} · condition {at.condition+1}</span>{summarizeCondition(c)}</li>:null;})}</ul>}
          <p className="strategy-review-next">{issue.recommendation}</p><Space wrap><Button disabled={disabled} onClick={()=>onEdit(issue.section)}>Edit {issue.section==='entry'?'buy rules':issue.section==='exit'?'sell rules':issue.section}</Button>{issue.fix&&<Button disabled={disabled} type="primary" onClick={()=>setPreview({issue,identity:review.identity})}>{issue.fix.label}</Button>}{!issue.fix&&<Button disabled={disabled||review.loading} type="primary" onClick={()=>setAiFix({issue,draft:structuredClone(draft),identity:review.identity})}>Suggest a fix</Button>}{kept?.identity===review.identity&&kept.ids.includes(issue.id)&&<Tag>Kept for this draft</Tag>}</Space>
        </article>)}</div>
        <Collapse ghost items={[{key:'configured',label:'What is already configured',children:<ul className="strategy-review-positives">{report.positives.map(text=><li key={text}><CheckCircleOutlined/>{text}</li>)}</ul>} ]}/>
        <p className="strategy-review-limits">{report.limitations.join(' ')}</p>
      </>}
    </>}
    {aiFix&&<AiRuleFix {...aiFix} currentIdentity={review.identity} disabled={disabled} onClose={()=>setAiFix(undefined)} onApply={onApply} onManual={()=>{setGuided(aiFix);setAiFix(undefined);}}/>}
    {guided&&<SuggestedRuleFix issue={guided.issue} draft={guided.draft} identity={guided.identity} currentIdentity={review.identity} disabled={disabled} onClose={()=>setGuided(undefined)} onApply={onApply} onEdit={()=>{onEdit(guided.issue.section);setGuided(undefined);}} onKeep={()=>{setKept({identity:review.identity,ids:[...(kept?.identity===review.identity?kept.ids:[]),guided.issue.id]});setGuided(undefined);}}/>}
    <Modal open={!!preview} title="Review this simplification" onCancel={()=>setPreview(undefined)} okText="Apply to draft" okButtonProps={{disabled:disabled||!pending||!revised}} onOk={()=>{if(pending&&revised)onApply(pending.issue,pending.identity);setPreview(undefined);}}>
      {!pending?<Alert type="warning" showIcon title="Your draft changed" description="Close this preview and use the updated review before applying a suggestion."/>:<>
        <p>{pending.issue.explanation}</p><strong>Before · {group?.logic}</strong><ul>{group?.conditions.map((c,i)=><li key={i}>{summarizeCondition(c)}</li>)}</ul>
        <strong>After · {group?.logic}</strong><ul>{revised&&fix&&revised[fix.location.side].groups[fix.location.group].conditions.map((c,i)=><li key={i}>{summarizeCondition(c)}</li>)}</ul>
        <p>Only this redundant condition is removed. The matching result stays the same. Review and save the draft separately; you can undo this change.</p>
      </>}
    </Modal>
  </section>;
}
