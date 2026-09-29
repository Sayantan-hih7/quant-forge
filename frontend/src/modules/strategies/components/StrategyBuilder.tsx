import { useEffect, useState } from 'react';
import { Alert, App, Button, Drawer, Form, Space, Tag } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, RobotOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { ConditionGroupsEditor } from '../../qualification/components/ConditionGroupsEditor';
import { horizonLabels } from '../../qualification/config/metrics';
import { useStrategyChatStore } from '../store/strategyChatStore';
import { tradingPlanSchema, strategyRiskSchema } from '../schemas/tradingPlanSchema';
import { blankTradingPlan, planFingerprint } from '../utils/tradingPlans';
import { StrategyChat } from './StrategyChat';
import { StrategyDraftPreview } from './StrategyDraftPreview';
import { SellRuleMode } from './SellRuleMode';
import { StrategyRiskFields } from './StrategyRiskFields';
import type { SavedStrategy } from '../hooks/useBackendStrategies';
import type { Horizon, Timeframe } from '../../qualification/types';
import type { StrategyMessage, TradingPlanDraft } from '../types/tradingPlan';
import type { AiExample } from '../../../services/aiAssistant';
import type { StrategySuggestionMeta } from '../store/strategyChatStore';
import { AiRiskPreview } from './AiRiskPreview';
import { useStrategyReview } from '../hooks/useStrategyReview';
import { StrategyRuleReview } from './StrategyRuleReview';
import { applyRuleReviewFix } from '../utils/ruleReviewFixes';
import type { RuleReviewIssue } from '../types/ruleReview';
import '../../../styles/qualification.css';

const steps = ['Setup', 'Buy rules', 'Sell rules', 'Risk', 'Review & save'];
const definition = (s: SavedStrategy): TradingPlanDraft => ({ name: s.name, entry: s.entry, exit: s.exit, risk: s.risk });
export function StrategyBuilder({ id, saved, onSave, onBacktest, onDirtyChange }: { id: string; saved?: SavedStrategy; onSave: (draft: TradingPlanDraft, revision: number) => Promise<SavedStrategy>; onBacktest: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const key = `backend-local:${id}`, { message } = App.useApp();
  const stored = useStrategyChatStore(s => s.conversations[key]), update = useStrategyChatStore(s => s.update);
  const [assistantFocus, setAssistantFocus] = useState<'risk'>();
  const chatKey = assistantFocus === 'risk' ? key + ':risk' : key;
  const conversation = useStrategyChatStore(s => s.conversations[chatKey]);
  const [example, setExample] = useState<AiExample>({ entry: null, atr: null });
  const [baseline, setBaseline] = useState(() => saved ? definition(saved) : undefined);
  const [baseRevision, setBaseRevision] = useState(() => stored?.baseRevision ?? (stored?.draft && planFingerprint(stored.draft) !== planFingerprint(baseline) ? 0 : saved?.revision ?? 0));
  const [step, setStep] = useState(0), [assistantOpen, setAssistantOpen] = useState(false), [assistantBusy, setAssistantBusy] = useState(false), [saveError, setSaveError] = useState<string>();
  const form = useForm<TradingPlanDraft>({ resolver: zodResolver(tradingPlanSchema), mode: 'onBlur', defaultValues: stored?.draft ?? baseline ?? blankTradingPlan() });
  const draft = useWatch({ control: form.control }) as TradingPlanDraft;
  const review = useStrategyReview(draft);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [simplification, setSimplification] = useState<{ before: TradingPlanDraft; after: string }>();
  const editReview = (section: RuleReviewIssue['section']) => { setStep({ setup: 0, entry: 1, exit: 2, risk: 3 }[section]); setReviewOpen(false); };
  const applySimplification = (issue: RuleReviewIssue, identity: string) => {
    const before = form.getValues();
    if (JSON.stringify(before) !== identity) { message.info('Your draft changed. Review its updated suggestions first.'); return; }
    const after = applyRuleReviewFix(before, issue);
    if (!after) { message.info('This suggestion no longer matches your draft.'); return; }
    setSimplification({ before: structuredClone(before), after: JSON.stringify(after) }); form.reset(after);
    message.success('Simplified your draft. Review and save when ready.');
  };
  const undoSimplification = () => {
    if (!simplification || JSON.stringify(form.getValues()) !== simplification.after) return;
    form.reset(structuredClone(simplification.before)); setSimplification(undefined);
    message.info('Restored the conditions from before the simplification.');
  };
  const reviewProps = { review, draft, disabled: form.formState.isSubmitting, onEdit: editReview, onApply: applySimplification,
    onUndo: undoSimplification, canUndo: simplification?.after === JSON.stringify(draft) };
  const changed = planFingerprint(draft) !== planFingerprint(baseline), conflict = !!saved && saved.revision !== baseRevision;
  useEffect(() => { onDirtyChange(changed); }, [changed, onDirtyChange]);
  useEffect(() => { const old = useStrategyChatStore.getState().conversations[key]; if (planFingerprint(old?.draft) !== planFingerprint(draft) || old?.baseRevision !== baseRevision) update(key, { draft, baseRevision }); }, [draft, baseRevision, key, update]);
  const parsedProposal = tradingPlanSchema.safeParse(conversation?.proposal), parsedRisk = strategyRiskSchema.safeParse(conversation?.proposal?.risk);
  const proposal = assistantFocus === 'risk' ? parsedRisk.success ? { ...draft, risk: parsedRisk.data } : undefined : parsedProposal.success ? parsedProposal.data : undefined;
  const suggestionMeta = conversation?.suggestionMeta;
  const staleSuggestion = !!suggestionMeta?.baseFingerprint && suggestionMeta.baseFingerprint !== planFingerprint(draft);
  const openAssistant = (focus?: 'risk') => { setAssistantFocus(focus); setAssistantOpen(true); };
  const invalid = () => {
    const result = tradingPlanSchema.safeParse(form.getValues()); if (result.success) return;
    const issue = result.error.issues[0], field = String(issue.path[0]);
    setStep(field === 'exit' ? 2 : field === 'risk' ? 3 : field === 'entry' && issue.path[1] === 'groups' ? 1 : 0);
    message.error(issue.message);
  };
  const save = async (value: TradingPlanDraft) => {
    setSaveError(undefined);
    if (review.report?.blocked) { setStep(4); message.error('Resolve the conflicting rules before saving.'); return; }
    try { const record = await onSave(value, baseRevision); const next = definition(record); setSimplification(undefined); setBaseline(next); setBaseRevision(record.revision); form.reset(next); update(key, { draft: next, baseRevision: record.revision, proposal: undefined }); message.success('Strategy saved. You can now backtest these rules.'); }
    catch (e) { setSaveError((e as Error).message); }
  };
  function changeHorizon(horizon: Horizon) {
    form.setValue('exit.horizon', horizon, { shouldDirty: true });
    form.setValue('risk.overnight', horizon !== 'intraday', { shouldDirty: true });
    const cadence = horizon === 'intraday' ? '15m' : 'daily';
    form.setValue('entry.cadence', cadence, { shouldDirty: true }); form.setValue('exit.cadence', cadence, { shouldDirty: true });
    form.setValue('risk.timeframe', horizon === 'intraday' ? '15m' : '1d', { shouldDirty: true });
    // Explicitly retain conditions: higher-timeframe context can be intentional.
    if (draft.entry.groups.some(g => g.conditions.length) || draft.exit.groups.some(g => g.conditions.length)) message.info('Holding and check frequency updated. Existing condition timeframes are preserved; review both rule sides.');
  }
  const next = async () => {
    const fields = step === 0 ? ['name', 'entry.horizon', 'entry.cadence'] as const : step === 1 ? ['entry'] as const : step === 2 ? ['exit'] as const : ['risk'] as const;
    if (await form.trigger([...fields])) setStep(Math.min(step + 1, 4)); else message.error('Complete the highlighted fields before continuing.');
  };
  const restore = () => { if (!saved) return; const next = definition(saved); setSimplification(undefined); form.reset(structuredClone(next)); setBaseline(next); setBaseRevision(saved.revision); setSaveError(undefined); update(key, { draft: next, baseRevision: saved.revision, proposal: undefined }); };
  const frame: Timeframe = draft.entry.cadence === 'daily' ? '1d' : draft.entry.cadence;
  const condition = { left: 'close' as const, leftFrame: frame, operator: 'gt' as const, rightType: 'indicator' as const, right: 'ema20' as const, rightFrame: frame, value: 0, multiplier: 1, tolerance: 2 };
  return <section className="strategy-builder-workflow" aria-label="Trading rule builder">
    <header className="strategy-workflow-header"><div><span className="strategy-eyebrow">{saved ? 'EDIT STRATEGY' : 'NEW STRATEGY'}</span><h2>{draft.name || 'Build your strategy'}</h2><p>{changed ? 'Draft kept on this device. Save to make these rules available for testing.' : 'Saved buy rules, sell rules and risk settings are ready to test.'}</p></div><Space wrap><Tag color={changed ? 'gold' : 'green'}>{changed ? 'Unsaved draft' : 'Saved'}</Tag><Button disabled={form.formState.isSubmitting} icon={<RobotOutlined aria-hidden />} onClick={() => openAssistant()}>AI assistant</Button></Space></header>
    {conflict && <Alert type="warning" showIcon className="mb-5" title="A newer saved strategy exists" description="Your local draft is based on an older revision. It will not overwrite the newer rules. Reload the saved strategy to continue editing it." action={<Button onClick={restore}>Reload saved strategy</Button>} />}
    {saveError && <Alert type="error" showIcon className="mb-5" title="Strategy was not saved" description={saveError} />}
    <nav className="strategy-builder-steps" aria-label="Strategy editor steps">{steps.map((label, index) => <button key={label} type="button" disabled={form.formState.isSubmitting} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    {step !== 4 && <StrategyRuleReview {...reviewProps} compact onOpen={() => setReviewOpen(true)} />}
    <FormProvider {...form}><Form layout="vertical" disabled={form.formState.isSubmitting} requiredMark={false} onFinish={() => { if (step === 4) void form.handleSubmit(save, invalid)(); else void next(); }}>
      <fieldset disabled={form.formState.isSubmitting} className="strategy-form-fields">
      <div className="strategy-step-content">
        {step === 0 && <><div className="strategy-builder-intro"><h3>Start with the basics</h3><p>Name your strategy and decide how often both sides should be checked. Each condition can use its own timeframe.</p></div><div className="strategy-setup-grid"><RhfInput control={form.control} name="name" label="Strategy name" placeholder="e.g. Daily trend pullback" maxLength={50} /><RhfSelect control={form.control} name="entry.horizon" label="Trading horizon" onValueChange={changeHorizon} options={Object.entries(horizonLabels).map(([value, label]) => ({ value, label }))} /><RhfSelect control={form.control} name="entry.cadence" label="Check both rules on candle close" onValueChange={value => { form.setValue('exit.cadence', value, { shouldDirty: true }); form.setValue('risk.timeframe', value === 'daily' ? '1d' : value, { shouldDirty: true }); }} options={[{ value: '1m', label: 'Every 1 minute' }, { value: '5m', label: 'Every 5 minutes' }, { value: '15m', label: 'Every 15 minutes' }, { value: 'daily', label: 'Daily at market close' }].filter(option => draft.entry.horizon !== 'intraday' || option.value !== 'daily')} /></div><div className="strategy-context-note"><strong>Starts with your monthly qualified stocks</strong><p>Choose which of those stocks to include when running a backtest or monitoring signals. Buy rules open a long position; sell rules close held shares.</p></div></>}
        {(step === 1 || step === 2) && <div key={step} aria-label={step === 1 ? 'Buy rule editor' : 'Sell rule editor'}><div className="strategy-builder-intro"><Tag color={step === 1 ? 'green' : 'red'}>{step === 1 ? 'BUY · ENTRY' : 'SELL · EXIT'}</Tag><h3>{step === 1 ? 'When should this strategy buy?' : 'When should this strategy sell?'}</h3><p>{step === 1 ? 'These conditions apply to a selected qualified stock when you do not already hold it.' : 'These conditions close held shares. Protective stops and targets can also trigger an exit.'}</p></div>{step === 2 && <SellRuleMode />}{(step === 1 || draft.exit.enabled !== false) && <ConditionGroupsEditor tier="tactical" prefix={step === 1 ? 'entry.' : 'exit.'} initialCondition={{ ...condition, operator: step === 1 ? 'gt' : 'lt' }} />}<p className="muted">{step === 1 && 'Each crossover event can trigger one entry attempt per stock in a session. State conditions such as EMA 5 above EMA 21 may match again; manual buys remain available.'}</p></div>}
        {step === 3 && <StrategyRiskFields example={example} onExampleChange={setExample} onAskAi={() => openAssistant('risk')} />}
        {step === 4 && <><StrategyRuleReview {...reviewProps} /><StrategyDraftPreview draft={draft} changed={changed} saved={!!saved} /><p className="strategy-context-note">Saving makes this definition available to Backtests and Signal Runner. Existing monitoring sessions keep the rules they started with.</p></>}
      </div>
      <footer className="strategy-builder-footer"><div><Button icon={<ArrowLeftOutlined aria-hidden />} disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button><span>Step {step + 1} of {steps.length}</span></div><Space wrap>{changed && saved && <Button type="text" icon={<UndoOutlined aria-hidden />} onClick={restore}>Discard changes</Button>}{saved && step < 4 && <Button htmlType="button" onClick={() => void form.handleSubmit(save, invalid)()} icon={<SaveOutlined aria-hidden />} loading={form.formState.isSubmitting} disabled={!changed || conflict}>Save changes</Button>}{step < 4 ? <Button key="next-step" htmlType="button" type="primary" icon={<ArrowRightOutlined aria-hidden />} onClick={event => { event.preventDefault(); void next(); }}>Next: {steps[step + 1]}</Button> : changed ? <Button key="save-strategy" type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={conflict} icon={<SaveOutlined aria-hidden />}>{saved ? 'Save strategy' : 'Create strategy'}</Button> : <Button type="primary" onClick={onBacktest}>Continue to backtest</Button>}</Space></footer>
      </fieldset>
    </Form></FormProvider>
    <Drawer open={reviewOpen} destroyOnHidden title="Review strategy rules" size={900} onClose={() => setReviewOpen(false)}>
      <StrategyRuleReview {...reviewProps} />
    </Drawer>
    <Drawer className="strategy-ai-drawer" open={assistantOpen} destroyOnHidden onClose={() => setAssistantOpen(false)} title={assistantFocus === 'risk' ? 'AI assistant · understand and set risk' : 'AI assistant · draft a suggestion'} size={1120} footer={<div className="strategy-ai-footer"><span>{suggestionMeta?.awaitingReply ? 'Read the reply and resolve any open questions before applying.' : 'Review changes, apply to the builder, then save when ready.'}</span><Button onClick={() => setAssistantOpen(false)}>Back to builder</Button><Button type="primary" disabled={form.formState.isSubmitting || assistantBusy || !proposal || suggestionMeta?.awaitingReply || staleSuggestion || planFingerprint(proposal) === planFingerprint(draft)} onClick={() => {
      if (!proposal || suggestionMeta?.awaitingReply || staleSuggestion) return;
      setSimplification(undefined);
      if (assistantFocus === 'risk') form.reset({ ...form.getValues(), risk: structuredClone(proposal.risk) });
      else form.reset(structuredClone(proposal));
      if (suggestionMeta?.example) setExample(suggestionMeta.example);
      update(chatKey, { proposal: undefined, suggestionMeta: undefined }); setAssistantOpen(false); setStep(assistantFocus === 'risk' ? 3 : 0);
      message.success(assistantFocus === 'risk' ? 'Risk settings applied to your draft. Review and save when ready.' : 'Suggestion applied. Review the buy rules, sell rules and risk settings before saving.');
    }}>{assistantFocus === 'risk' ? 'Apply risk settings' : 'Apply to builder'}</Button></div>}>
      <div className="strategy-ai-layout"><StrategyChat key={chatKey} active={assistantOpen} focus={assistantFocus} example={suggestionMeta?.example ?? example} messages={conversation?.messages ?? []} draft={!staleSuggestion && proposal ? proposal : draft} onUpdate={(messages: StrategyMessage[], next?: TradingPlanDraft, meta?: StrategySuggestionMeta) => update(chatKey, { messages, ...(next ? { proposal: next } : {}), ...(meta ? { suggestionMeta: { ...meta, baseFingerprint: planFingerprint(draft) } } : {}) })} onBusyChange={setAssistantBusy} /><section className="strategy-preview" aria-label="AI suggestion preview"><div className="strategy-preview-heading"><span>{assistantFocus === 'risk' ? 'YOUR RISK PLAN' : 'PROPOSED RULES'}</span><small>{suggestionMeta?.awaitingReply ? 'Needs your input' : proposal ? 'Not applied yet' : 'Current settings'}</small></div><div className="strategy-preview-body">
        {staleSuggestion && <Alert showIcon type="warning" title="Your manual settings changed" description="This suggestion is from an earlier draft. Ask the assistant to update it using your current settings before applying." />}
        {suggestionMeta?.awaitingReply && proposal && <Alert showIcon type="info" title="Previous suggestion shown" description="It cannot be applied while the latest request needs clarification or has no complete proposal." />}
        {assistantFocus === 'risk' ? <AiRiskPreview risk={proposal?.risk ?? draft.risk} before={draft.risk} example={suggestionMeta?.example ?? example} proposed={!!proposal} /> : <><StrategyDraftPreview draft={proposal} changed saved={false} />{proposal && <AiRiskPreview risk={proposal.risk} before={draft.risk} example={suggestionMeta?.example} />}</>}
      </div></section></div>
    </Drawer>
  </section>;
}
