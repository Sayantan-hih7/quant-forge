import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Space, Spin } from 'antd';
import { useAiAssistant } from '../../../hooks/useAiAssistant';
import type { AiMessage, AiReply } from '../../../services/aiAssistant';
import type { TradingPlanDraft } from '../types/tradingPlan';
import type { RuleReviewIssue } from '../types/ruleReview';
import { tradingPlanSchema } from '../schemas/tradingPlanSchema';
import { strategyChanges } from '../utils/strategyChanges';
import { useStrategyReview } from '../hooks/useStrategyReview';
import { AssistantQuestions } from './AssistantQuestions';

/** Limit AI repair to the affected section; unrelated settings retain their exact values. */
function scopeAiRepair(draft:TradingPlanDraft,proposal:TradingPlanDraft,section:RuleReviewIssue['section']):TradingPlanDraft {
  const next=structuredClone(draft);
  if(section==='entry'||section==='exit') {
    next[section].groups=structuredClone(proposal[section].groups);
    next[section].logic=proposal[section].logic;
  } else if(section==='risk') {
    next.risk={...structuredClone(proposal.risk),initialCapital:draft.risk.initialCapital,riskPercent:draft.risk.riskPercent,maxPositions:draft.risk.maxPositions,overnight:draft.risk.overnight,timeframe:draft.risk.timeframe,entryCutoffMinute:draft.risk.entryCutoffMinute,costModel:draft.risk.costModel,feePercent:draft.risk.feePercent,slippagePercent:draft.risk.slippagePercent,exchangeFeePercent:draft.risk.exchangeFeePercent};
  }
  else {next.entry.cadence=proposal.entry.cadence;next.exit.cadence=proposal.entry.cadence;}
  return tradingPlanSchema.parse(next);
}
export function AiRuleFix({issue,draft,identity,currentIdentity,disabled,onClose,onApply,onManual}:{
  issue:RuleReviewIssue;draft:TradingPlanDraft;identity:string;currentIdentity:string;disabled:boolean;
  onClose:()=>void;onApply:(issue:RuleReviewIssue,identity:string)=>void;onManual:()=>void;
}) {
  const assistant=useAiAssistant();
  const [messages,setMessages]=useState<AiMessage[]>([]),[reply,setReply]=useState<AiReply<TradingPlanDraft>>(),[answer,setAnswer]=useState('');
  const stale=identity!==currentIdentity;
  const proposal=reply?.proposal??undefined;
  const review=useStrategyReview(proposal??draft);
  const changes=proposal?strategyChanges(draft,proposal):[];
  const ready=!!proposal&&changes.length>0&&!assistant.busy&&!stale&&!disabled&&!!review.report&&!review.report.blocked&&!review.loading&&!review.error&&!review.validation;
  const initialPrompt=`Suggest a concrete minimal correction for this strategy issue: ${issue.title}. ${issue.explanation} Affected section: ${issue.section}. Locations: ${JSON.stringify(issue.locations)}. Use the existing strategy, descriptions, opposite-side rules and risk context to infer the likely intent. I authorize a sensible suggested correction, with assumptions clearly disclosed. Do not ask me to operate the manual builder. Ask a short relevant question only if intent cannot reasonably be inferred. Preserve unrelated conditions, risk limits, horizon and cadence. Never resolve a conflict by disabling all buy/sell rules. For a risk warning, suggest an alternative and explain its tradeoff; do not silently change capital, costs, position limits or risk per trade. Return the corrected strategy for preview, not execution.`.slice(0,1200);
  const lastPrompt=useRef(initialPrompt);
  const send=async(prompt:string)=>{
    if(assistant.busy||stale)return;
    lastPrompt.current=prompt;
    setReply(undefined);
    const result=await assistant.send({scope:'strategy',prompt,messages,currentDraft:draft},value=>scopeAiRepair(draft,tradingPlanSchema.parse(value),issue.section));
    if(result){setReply(result);setMessages([...messages,{role:'user',text:prompt},{role:'assistant',text:result.text,questions:result.questions}]);setAnswer('');}
  };
  const start=useRef(()=>void send(initialPrompt));
  useEffect(()=>{const timer=setTimeout(()=>start.current(),0);return()=>clearTimeout(timer);},[]);
  return <Modal open className="strategy-fix-modal" title="AI suggested fix" width={820} onCancel={onClose} footer={<Space wrap>
    <Button onClick={onManual}>Edit manually instead</Button><Button onClick={onClose}>Cancel</Button>
    <Button type="primary" disabled={!ready} onClick={()=>{if(ready&&proposal){onApply({...issue,fix:{kind:'replace-draft',label:'AI suggested fix',expectedDraft:draft,replacement:proposal}},identity);onClose();}}}>Apply to draft</Button>
  </Space>}>
    <h3>{issue.title}</h3><p>AI proposes a correction using this strategy. Review every change before applying it.</p>
    {stale&&<Alert type="warning" showIcon title="Your draft changed" description="Close this preview and request a fix for the updated draft."/>}
    {assistant.busy&&<Space><Spin size="small"/><span>AI is preparing a correction...</span><Button onClick={assistant.cancel}>Stop</Button></Space>}
    {assistant.error&&<Alert type="error" showIcon title="AI could not prepare a fix" description={assistant.error} action={<Button disabled={stale} onClick={()=>void send(lastPrompt.current)}>Retry</Button>}/>}
    {!assistant.busy&&!reply&&!assistant.error&&<Button disabled={stale} onClick={()=>void send(lastPrompt.current)}>Generate suggested fix</Button>}
    {reply&&<><p>{reply.text}</p>{!!reply.assumptions.length&&<Alert type="info" title="Assumptions to review" description={<ul>{reply.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul>}/>}
      {!!reply.blockers.length&&<Alert type="warning" title="What is still needed" description={reply.blockers.join(' ')}/>}
      {!!reply.questions.length&&<AssistantQuestions key={messages.length} questions={reply.questions} busy={assistant.busy||stale} onAnswer={prompt=>void send(prompt)}/>}
    </>}
    {!!proposal&&<><h4>Proposed changes</h4><p>Only changes in the affected section are included. Saved rules and running sessions are unchanged.</p>
      {!changes.length?<Alert type="warning" title="The AI did not change the affected settings"/>:changes.map((change,i)=><div className="ai-fix-change" key={i}><strong>{change.section}: {change.label}</strong><p><b>Before:</b> {change.before}</p><p><b>After:</b> {change.after}</p></div>)}
      {review.loading?<p>Checking the proposal for conflicts...</p>:review.error||review.validation?<Alert type="warning" title="Proposal could not be verified" description={review.error||review.validation} action={<Button onClick={review.retry}>Retry check</Button>}/>:review.report?.blocked?<Alert type="error" title="The proposed rules still conflict" description={review.report.issues.filter(i=>i.severity==='error').map(i=>i.title).join('. ')} action={<Button disabled={assistant.busy||stale} onClick={()=>void send(`Your proposed correction still conflicts: ${review.report?.issues.filter(i=>i.severity==='error').map(i=>i.explanation).join(' ').slice(0,850)}. Produce a corrected proposal, retaining the requested intent.`)}>Ask AI to revise</Button>}/>:<Alert type="success" showIcon title="No conflict found in the supported checks" description="Backtesting is still needed. This is not a prediction of returns."/>}
      {!!review.report?.issues.filter(i=>i.severity==='warning').length&&<p>Still worth reviewing: {review.report.issues.filter(i=>i.severity==='warning').map(i=>i.title).join('; ')}</p>}
    </>}
    {!assistant.busy&&!reply?.questions.length&&<><h4>Add context or refine the suggestion</h4><Input.TextArea aria-label="Context for AI fix" value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={1200} autoSize={{minRows:2,maxRows:4}} placeholder="For example: sell when the daily close drops below weekly EMA 5."/><Button style={{marginTop:8}} disabled={!answer.trim()||stale} onClick={()=>void send(answer)}>Send to AI</Button></>}
    <p>Apply changes only to the draft. Undo is available; save and backtest separately.</p>
  </Modal>;
}
