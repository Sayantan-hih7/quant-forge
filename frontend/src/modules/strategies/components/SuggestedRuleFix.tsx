import { useState } from 'react';
import { Alert, Button, InputNumber, Modal, Select, Space } from 'antd';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import type { TradingPlanDraft } from '../types/tradingPlan';
import type { RuleReviewIssue } from '../types/ruleReview';
import { ConditionRow } from '../../qualification/components/ConditionGroupsEditor';
import { summarizeCondition } from '../../qualification/utils/ruleSummary';
import { applyRuleReviewFix } from '../utils/ruleReviewFixes';
import { tradingPlanSchema } from '../schemas/tradingPlanSchema';
import { useStrategyReview } from '../hooks/useStrategyReview';

export function SuggestedRuleFix({ issue, draft, identity, currentIdentity, disabled, onClose, onApply, onKeep, onEdit }: {
  issue:RuleReviewIssue;draft:TradingPlanDraft;identity:string;currentIdentity:string;disabled:boolean;
  onClose:()=>void;onApply:(issue:RuleReviewIssue,identity:string)=>void;onKeep:()=>void;onEdit:()=>void;
}) {
  const form=useForm<TradingPlanDraft>({defaultValues:structuredClone(draft)});
  const edited=useWatch({control:form.control}) as TradingPlanDraft;
  const [locationIndex,setLocationIndex]=useState(0),[action,setAction]=useState<'correct'|'remove'>(),[showPreview,setShowPreview]=useState(false);
  const at=issue.locations[locationIndex],before=at?draft[at.side].groups[at.group]?.conditions[at.condition]:undefined;
  const tightStop=issue.section==='risk'&&issue.title==='Tight stop for an overnight strategy';
  const proposed:RuleReviewIssue={...issue,fix:tightStop?{kind:'update-risk',label:'Adjust stop limits',expectedRisk:draft.risk,replacement:edited.risk}:at&&before&&action? action==='remove'?{kind:'remove-condition',label:'Remove unintended condition',location:at,expectedCondition:before}:{kind:'replace-condition',label:'Correct condition',location:at,expectedCondition:before,replacement:edited[at.side].groups[at.group].conditions[at.condition]}:undefined};
  const validation=tradingPlanSchema.safeParse(edited);
  const revised=applyRuleReviewFix(draft,proposed);
  const changed=!!revised&&JSON.stringify(revised)!==JSON.stringify(draft),stale=identity!==currentIdentity;
  const review=useStrategyReview(showPreview&&revised?revised:draft);
  const conflicts=review.report?.issues.filter(i=>i.severity==='error').length??0;
  const canPreview=changed&&!stale&&!disabled;
  const canApply=canPreview&&showPreview&&!review.loading&&!review.error&&!review.validation&&!!review.report;
  const describeRisk=(risk:TradingPlanDraft['risk'])=>`Initial stop: ${risk.stopMode}${['fixed','trailing'].includes(risk.stopMode)?` (${risk.stopPercent}%)`:''}. Maximum initial stop distance: ${risk.maxStopPercent==null?'No cap':`${risk.maxStopPercent}%`}.`;
  return <Modal className="strategy-fix-modal" open title="Suggest a fix" width={820} onCancel={onClose} footer={<Space wrap>
    <Button onClick={onClose}>Cancel</Button>
    {!showPreview?<Button type="primary" disabled={!canPreview} onClick={()=>setShowPreview(true)}>Preview change</Button>:<><Button onClick={()=>setShowPreview(false)}>Adjust proposal</Button><Button type="primary" disabled={!canApply} onClick={()=>{if(canApply){onApply(proposed,identity);onClose();}}}>Apply to draft</Button></>}
  </Space>}>
    <h3>{issue.title}</h3><p>{issue.explanation}</p>
    {stale&&<Alert type="warning" showIcon title="Your draft changed" description="Close this suggestion and review the current draft before applying a change."/>}
    {!showPreview?<>
      {before&&at?<>
        <p>Which condition did you intend to change? No direction or threshold will be chosen for you.</p>
        <Select aria-label="Condition to resolve" style={{width:'100%'}} virtual={false} value={locationIndex} options={issue.locations.map((loc,index)=>({value:index,label:`${loc.side==='entry'?'Buy':'Sell'} group ${loc.group+1}, condition ${loc.condition+1}`}))} onChange={value=>{setLocationIndex(value);setAction(undefined);form.reset(structuredClone(draft));}}/>
        <p>{summarizeCondition(before)}</p>
        <Space wrap><Button type={action==='correct'?'primary':'default'} onClick={()=>setAction('correct')}>Correct this condition</Button><Button disabled={draft[at.side].groups[at.group].conditions.length<=1} type={action==='remove'?'primary':'default'} onClick={()=>setAction('remove')}>Remove this condition</Button></Space>
        {draft[at.side].groups[at.group].conditions.length<=1&&<p className="muted">This is the only condition in its group. Correct it here, or edit the exit plan if you intend to use stops and targets only.</p>}
        {action==='correct'&&<><p>Set what you intended to compare: a value, another candle or an indicator. Check its timeframe and candle offset too.</p><FormProvider {...form}><ConditionRow key={locationIndex} group={at.group} index={at.condition} prefix={at.side==='entry'?'entry.':'exit.'} tier="tactical" startOpen canRemove={false} onRemove={()=>undefined}/></FormProvider></>}
        {action==='remove'&&<Alert style={{marginTop:16}} type="warning" showIcon title="Removing this condition changes which values match" description="The preview will check the remaining rules. Remove it only if it was unintended."/>}
      </>:tightStop?<>
        <p>A tight stop can be intentional. Keep your setting, or enter the limits you want; the app will not widen them automatically.</p>
        {['fixed','trailing'].includes(draft.risk.stopMode)&&<label className="strategy-fix-input">Initial stop distance (%)<InputNumber aria-label="Initial stop distance (%)" min={0.01} max={100} value={edited.risk.stopPercent} onChange={v=>{if(v!=null)form.setValue('risk.stopPercent',v);}}/></label>}
        {draft.risk.maxStopPercent!=null&&<label className="strategy-fix-input">Maximum initial stop distance (%)<InputNumber aria-label="Maximum initial stop distance (%)" min={0.01} max={100} value={edited.risk.maxStopPercent} onChange={v=>{if(v!=null)form.setValue('risk.maxStopPercent',v);}}/></label>}
        <p>Wider stops can reduce the share quantity at the same risk per trade. R-based targets also change. Backtest the new draft before relying on it.</p>
      </>:<Alert type="info" showIcon title="Your intended behaviour is needed" description={issue.recommendation}/>}
      {(action==='correct'||tightStop)&&!validation.success&&<Alert type="warning" showIcon title="Complete the proposal" description={validation.error.issues[0]?.message}/>}
      <Space style={{marginTop:16}} wrap>{issue.severity!=='error'&&<Button disabled={stale||disabled} onClick={onKeep}>Keep this setting</Button>}<Button onClick={onEdit}>Open full {issue.section==='risk'?'risk setup':'rule builder'}</Button></Space>
    </>:<>
      <h4>Before</h4><p>{tightStop?describeRisk(draft.risk):before&&summarizeCondition(before)}</p>
      <h4>After</h4><p>{tightStop&&revised?describeRisk(revised.risk):action==='remove'?'Remove this condition; all other conditions stay unchanged.':at&&revised&&summarizeCondition(revised[at.side].groups[at.group].conditions[at.condition])}</p>
      {review.loading?<Alert type="info" title="Checking the proposed rules..."/>:review.error||review.validation?<Alert type="warning" title="Cannot verify this proposal" description={review.error||review.validation} action={<Button onClick={review.retry}>Retry check</Button>}/>:<Alert type={conflicts?'warning':'success'} showIcon title={conflicts?`${conflicts} conflict(s) still need attention`:'No conflict found in the supported checks'} description={conflicts?review.report?.issues.filter(i=>i.severity==='error').map(i=>i.title).join('. '):'This is a logic check, not proof of profitability. Other warnings may still need review.'}/>}
      <p>This changes only your draft. You can undo it before making another edit. Saving, backtesting and starting a paper session are separate actions.</p>
    </>}
  </Modal>;
}
