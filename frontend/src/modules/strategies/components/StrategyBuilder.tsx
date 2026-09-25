import { useEffect, useState } from 'react';
import { Alert, App, Button, Drawer, Form, Space, Tag } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, RobotOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { ConditionGroupsEditor } from '../../qualification/components/ConditionGroupsEditor';
import { horizonLabels } from '../../qualification/config/metrics';
import { useStrategyChatStore } from '../store/strategyChatStore';
import { tradingPlanSchema } from '../schemas/tradingPlanSchema';
import { blankTradingPlan, planFingerprint } from '../utils/tradingPlans';
import { StrategyChat } from './StrategyChat';
import { StrategyDraftPreview } from './StrategyDraftPreview';
import { StrategyRiskFields } from './StrategyRiskFields';
import type { SavedStrategy } from '../hooks/useBackendStrategies';
import type { Horizon, Timeframe } from '../../qualification/types';
import type { StrategyMessage, TradingPlanDraft } from '../types/tradingPlan';
import '../../../styles/qualification.css';

const steps = ['Setup', 'Buy rules', 'Sell rules', 'Risk', 'Review & save'];
const definition = (s: SavedStrategy): TradingPlanDraft => ({ name: s.name, entry: s.entry, exit: s.exit, risk: s.risk });
export function StrategyBuilder({ id, saved, onSave, onBacktest, onDirtyChange }: { id: string; saved?: SavedStrategy; onSave: (draft: TradingPlanDraft, revision: number) => Promise<SavedStrategy>; onBacktest: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const key = `backend-local:${id}`, { message } = App.useApp();
  const conversation = useStrategyChatStore(s => s.conversations[key]), update = useStrategyChatStore(s => s.update);
  const [baseline, setBaseline] = useState(() => saved ? definition(saved) : undefined);
  const [baseRevision, setBaseRevision] = useState(() => conversation?.baseRevision ?? (conversation?.draft && planFingerprint(conversation.draft) !== planFingerprint(baseline) ? 0 : saved?.revision ?? 0));
  const [step, setStep] = useState(0), [assistantOpen, setAssistantOpen] = useState(false), [assistantBusy, setAssistantBusy] = useState(false), [saveError, setSaveError] = useState<string>();
  const form = useForm<TradingPlanDraft>({ resolver: zodResolver(tradingPlanSchema), mode: 'onBlur', defaultValues: conversation?.draft ?? baseline ?? blankTradingPlan() });
  const draft = useWatch({ control: form.control }) as TradingPlanDraft;
  const changed = planFingerprint(draft) !== planFingerprint(baseline), conflict = !!saved && saved.revision !== baseRevision;
  useEffect(() => { onDirtyChange(changed); }, [changed, onDirtyChange]);
  useEffect(() => { const old = useStrategyChatStore.getState().conversations[key]; if (planFingerprint(old?.draft) !== planFingerprint(draft) || old?.baseRevision !== baseRevision) update(key, { draft, baseRevision }); }, [draft, baseRevision, key, update]);
  const parsedProposal = tradingPlanSchema.safeParse(conversation?.proposal), proposal = parsedProposal.success ? parsedProposal.data : undefined;
  const invalid = () => {
    const result = tradingPlanSchema.safeParse(form.getValues()); if (result.success) return;
    const issue = result.error.issues[0], field = String(issue.path[0]);
    setStep(field === 'exit' ? 2 : field === 'risk' ? 3 : field === 'entry' && issue.path[1] === 'groups' ? 1 : 0);
    message.error(issue.message);
  };
  const save = async (value: TradingPlanDraft) => {
    setSaveError(undefined);
    try { const record = await onSave(value, baseRevision); const next = definition(record); setBaseline(next); setBaseRevision(record.revision); form.reset(next); update(key, { draft: next, baseRevision: record.revision, proposal: undefined }); message.success('Strategy saved. You can now backtest these rules.'); }
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
  const restore = () => { if (!saved) return; const next = definition(saved); form.reset(structuredClone(next)); setBaseline(next); setBaseRevision(saved.revision); setSaveError(undefined); update(key, { draft: next, baseRevision: saved.revision, proposal: undefined }); };
  const frame: Timeframe = draft.entry.cadence === 'daily' ? '1d' : draft.entry.cadence;
  const condition = { left: 'close' as const, leftFrame: frame, operator: 'gt' as const, rightType: 'indicator' as const, right: 'ema20' as const, rightFrame: frame, value: 0, multiplier: 1, tolerance: 2 };
  return <section className="strategy-builder-workflow" aria-label="Trading rule builder">
    <header className="strategy-workflow-header"><div><span className="strategy-eyebrow">{saved ? 'EDIT STRATEGY' : 'NEW STRATEGY'}</span><h2>{draft.name || 'Build your strategy'}</h2><p>{changed ? 'Draft kept on this device. Save to make these rules available for testing.' : 'Saved buy rules, sell rules and risk settings are ready to test.'}</p></div><Space wrap><Tag color={changed ? 'gold' : 'green'}>{changed ? 'Unsaved draft' : 'Saved'}</Tag><Button icon={<RobotOutlined aria-hidden />} onClick={() => setAssistantOpen(true)}>AI assistant</Button></Space></header>
    {conflict && <Alert type="warning" showIcon className="mb-5" title="A newer saved strategy exists" description="Your local draft is based on an older revision. It will not overwrite the newer rules. Reload the saved strategy to continue editing it." action={<Button onClick={restore}>Reload saved strategy</Button>} />}
    {saveError && <Alert type="error" showIcon className="mb-5" title="Strategy was not saved" description={saveError} />}
    <nav className="strategy-builder-steps" aria-label="Strategy editor steps">{steps.map((label, index) => <button key={label} type="button" aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    <FormProvider {...form}><Form layout="vertical" requiredMark={false} onFinish={() => { if (step === 4) void form.handleSubmit(save, invalid)(); else void next(); }}>
      <div className="strategy-step-content">
        {step === 0 && <><div className="strategy-builder-intro"><h3>Start with the basics</h3><p>Name your strategy and decide how often both sides should be checked. Each condition can use its own timeframe.</p></div><div className="strategy-setup-grid"><RhfInput control={form.control} name="name" label="Strategy name" placeholder="e.g. Daily trend pullback" maxLength={50} /><RhfSelect control={form.control} name="entry.horizon" label="Trading horizon" onValueChange={changeHorizon} options={Object.entries(horizonLabels).map(([value, label]) => ({ value, label }))} /><RhfSelect control={form.control} name="entry.cadence" label="Check both rules on candle close" onValueChange={value => { form.setValue('exit.cadence', value, { shouldDirty: true }); form.setValue('risk.timeframe', value === 'daily' ? '1d' : value, { shouldDirty: true }); }} options={[{ value: '1m', label: 'Every 1 minute' }, { value: '5m', label: 'Every 5 minutes' }, { value: '15m', label: 'Every 15 minutes' }, { value: 'daily', label: 'Daily at market close' }].filter(option => draft.entry.horizon !== 'intraday' || option.value !== 'daily')} /></div><div className="strategy-context-note"><strong>Starts with your monthly qualified stocks</strong><p>Choose which of those stocks to include when running a backtest or monitoring signals. Buy rules open a long position; sell rules close held shares.</p></div></>}
        {(step === 1 || step === 2) && <div key={step} aria-label={step === 1 ? 'Buy rule editor' : 'Sell rule editor'}><div className="strategy-builder-intro"><Tag color={step === 1 ? 'green' : 'red'}>{step === 1 ? 'BUY · ENTRY' : 'SELL · EXIT'}</Tag><h3>{step === 1 ? 'When should this strategy buy?' : 'When should this strategy sell?'}</h3><p>{step === 1 ? 'These conditions apply to a selected qualified stock when you do not already hold it.' : 'These conditions close held shares. Protective stops and targets can also trigger an exit.'}</p></div><ConditionGroupsEditor tier="tactical" prefix={step === 1 ? 'entry.' : 'exit.'} initialCondition={{ ...condition, operator: step === 1 ? 'gt' : 'lt' }} /></div>}
        {step === 3 && <StrategyRiskFields />}
        {step === 4 && <><StrategyDraftPreview draft={draft} changed={changed} saved={!!saved} /><p className="strategy-context-note">Saving makes this definition available to Backtests and Signal Runner. Existing monitoring sessions keep the rules they started with.</p></>}
      </div>
      <footer className="strategy-builder-footer"><div><Button icon={<ArrowLeftOutlined aria-hidden />} disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button><span>Step {step + 1} of {steps.length}</span></div><Space wrap>{changed && saved && <Button type="text" icon={<UndoOutlined aria-hidden />} onClick={restore}>Discard changes</Button>}{saved && step < 4 && <Button htmlType="button" onClick={() => void form.handleSubmit(save, invalid)()} icon={<SaveOutlined aria-hidden />} loading={form.formState.isSubmitting} disabled={!changed || conflict}>Save changes</Button>}{step < 4 ? <Button key="next-step" htmlType="button" type="primary" icon={<ArrowRightOutlined aria-hidden />} onClick={event => { event.preventDefault(); void next(); }}>Next: {steps[step + 1]}</Button> : changed ? <Button key="save-strategy" type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={conflict} icon={<SaveOutlined aria-hidden />}>{saved ? 'Save strategy' : 'Create strategy'}</Button> : <Button type="primary" onClick={onBacktest}>Continue to backtest</Button>}</Space></footer>
    </Form></FormProvider>
    <Drawer className="strategy-ai-drawer" open={assistantOpen} destroyOnHidden onClose={() => setAssistantOpen(false)} title="AI assistant · draft a suggestion" size={1040} footer={<div className="strategy-ai-footer"><span>Review suggestions here, then apply them to your editable draft.</span><Button onClick={() => setAssistantOpen(false)}>Back to builder</Button><Button type="primary" disabled={assistantBusy || !proposal || planFingerprint(proposal) === planFingerprint(draft)} onClick={() => { if (!proposal) return; form.reset(structuredClone(proposal)); update(key, { proposal: undefined }); setAssistantOpen(false); setStep(0); message.success('Suggestion applied. Review the buy rules, sell rules and risk settings before saving.'); }}>Apply to builder</Button></div>}>
      <div className="strategy-ai-layout"><StrategyChat active={assistantOpen} messages={conversation?.messages ?? []} draft={proposal ?? draft} onUpdate={(messages: StrategyMessage[], next?: TradingPlanDraft) => update(key, { messages, ...(next ? { proposal: next } : {}) })} onBusyChange={setAssistantBusy} /><section className="strategy-preview" aria-label="AI suggestion preview"><div className="strategy-preview-heading"><span>PROPOSED RULES</span><small>Not applied yet</small></div><div className="strategy-preview-body"><StrategyDraftPreview draft={proposal} changed saved={false} /></div></section></div>
    </Drawer>
  </section>;
}
