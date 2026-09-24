import { useEffect, useState } from 'react';
import { App, Button, Drawer, Form, Select, Tabs, Tag } from 'antd';
import { ExperimentOutlined, FileTextOutlined, PlusOutlined, RobotOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { ConditionGroupsEditor } from '../../qualification/components/ConditionGroupsEditor';
import { horizonLabels } from '../../qualification/config/metrics';
import { useQualificationStore } from '../../qualification/store/qualificationStore';
import { useStrategyChatStore } from '../store/strategyChatStore';
import { tradingPlanSchema } from '../schemas/tradingPlanSchema';
import { planFingerprint, sampleTradingPlan, savedPlanDraft } from '../utils/tradingPlans';
import { StrategyChat } from './StrategyChat';
import { StrategyDraftPreview } from './StrategyDraftPreview';
import { StrategyRiskFields } from './StrategyRiskFields';
import type { Horizon, QualificationWorkspace, RuleDefinition } from '../../qualification/types';
import type { StrategyMessage, TradingPlanDraft } from '../types/tradingPlan';
import '../../../styles/qualification.css';

function blankDraft() {
  const draft = sampleTradingPlan('intraday');
  return { ...draft, name: '', entry: { ...draft.entry, name: 'Buy entry', groups: [draft.entry.groups[0]] }, exit: { ...draft.exit, name: 'Sell exit' } };
}

export function TradingStrategyEditor({ owner, workspace, selected, onSelect, onBacktest, onSave }: { owner: string; workspace: QualificationWorkspace; selected: string; onSelect: (id: string) => void; onBacktest: (id: string) => void; onSave?: (draft:TradingPlanDraft) => Promise<void> }) {
  const chat = useStrategyChatStore();
  const { message } = App.useApp();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [section, setSection] = useState('entry');
  const key = `${owner}:${selected}`;
  const conversation = chat.conversations[key];
  const plan = workspace.tradingPlans?.find((item) => item.id === selected || item.entryRuleId === selected || item.exitRuleId === selected || item.id === conversation?.savedPlanId);
  const existing = workspace.templates.find((rule) => rule.id === selected && rule.tier === 'tactical');
  const saved = plan ? savedPlanDraft(workspace, plan) : undefined;
  const form = useForm<TradingPlanDraft>({ resolver: zodResolver(tradingPlanSchema), mode: 'onBlur', defaultValues: conversation?.draft ?? saved ?? blankDraft() });
  const draft = useWatch({ control: form.control }) as TradingPlanDraft;
  const changed = !!plan?.needsReview || planFingerprint(draft) !== planFingerprint(saved);
  const entries = workspace.tradingPlans ?? [];
  const updateChat = chat.update;
  useEffect(() => { updateChat(key, { draft }); }, [draft, updateChat, key]);
  const updateProposal = (messages: StrategyMessage[], proposal?: TradingPlanDraft) => { const parsed = tradingPlanSchema.safeParse(proposal); updateChat(key, { messages, ...(parsed.success ? { proposal: parsed.data } : {}) }); };
  const closeAssistant = () => { setAssistantOpen(false); setAssistantBusy(false); };
  const selectStrategy = (id: string) => { if (id !== selected) { closeAssistant(); setSwitching(true); onSelect(id); } };
  const save = async (value: TradingPlanDraft) => {
    if(onSave){try{await onSave(value);form.reset(value);chat.clear(key);message.success('Buy rules, sell rules and risk settings saved to the backend.');}catch(e){message.error((e as Error).message);}return;}
    const result = useQualificationStore.getState().saveTradingPlan(owner, value, plan?.id, existing?.id);
    if (!result) { message.error('The strategy could not be saved. Review its buy, sell and risk settings.'); return; }
    const stored = savedPlanDraft(useQualificationStore.getState().workspaces[owner], result)!;
    form.reset(stored);
    updateChat(`${owner}:${result.entryRuleId}`, { ...conversation, draft: stored, proposal: undefined, savedPlanId: result.id });
    if (selected !== result.entryRuleId) chat.clear(key);
    onSelect(result.entryRuleId);
    message.success('Buy rules, sell rules and risk settings saved together.');
  };
  const invalid = () => { const issue = tradingPlanSchema.safeParse(form.getValues()); if (!issue.success) { const first = issue.error.issues[0]; setSection(first.path[0] === 'exit' ? 'exit' : first.path[0] === 'risk' ? 'risk' : 'entry'); message.error(first.message); } };
  const options = entries.map(item => ({ value: item.entryRuleId, label: item.name + (item.needsReview ? ' · Review rules' : '') }));
  if (!options.some((item) => item.value === selected)) options.push({ value: selected, label: plan?.name ?? 'New strategy draft' });
  const setHorizon = (horizon: Horizon) => { form.setValue('exit.horizon', horizon, { shouldDirty: true }); form.setValue('risk.overnight', horizon !== 'intraday', { shouldDirty: true }); form.setValue('risk.timeframe', horizon === 'intraday' ? '15m' : '1d', { shouldDirty: true }); const cadence = horizon === 'intraday' ? '5m' : 'daily'; form.setValue('entry.cadence', cadence, { shouldDirty: true }); form.setValue('exit.cadence', cadence, { shouldDirty: true }); };
  const count = (rule: RuleDefinition) => rule.groups.reduce((sum, group) => sum + group.conditions.length, 0);
  const parsedProposal = tradingPlanSchema.safeParse(conversation?.proposal);
  const proposal = parsedProposal.success ? parsedProposal.data : undefined;
  const canApply = !assistantBusy && !!proposal && planFingerprint(proposal) !== planFingerprint(draft);
  return <div className="strategy-editor"><div className="strategy-toolbar"><div className="strategy-select"><label htmlFor="strategy-selection">Strategy</label><Select id="strategy-selection" aria-label="Strategy" showSearch optionFilterProp="label" value={selected} options={options} onChange={selectStrategy} disabled={switching} /></div><Button icon={<PlusOutlined aria-hidden />} loading={switching} onClick={() => selectStrategy(`new-${crypto.randomUUID()}`)}>New strategy</Button><span className="strategy-autosave">Drafts saved on this device</span><Tag color="purple">Monthly qualified stocks</Tag></div>
    <section className="strategy-manual-builder q-rule-editor" aria-label="Trading rule builder">
      <header className="strategy-builder-heading"><div><span className="strategy-eyebrow">TRADING RULE BUILDER</span><h2>{draft.name || 'New strategy'}</h2><p>Set the conditions to buy, the conditions to sell, and the risk controls.</p></div><div><Tag color={changed ? 'gold' : 'green'}>{changed ? plan ? 'Unsaved changes' : 'Not saved' : 'Saved'}</Tag><Button disabled={switching} icon={<RobotOutlined aria-hidden />} onClick={() => setAssistantOpen(true)}>AI assistant</Button></div></header>
      {plan?.needsReview && <div className="strategy-existing-note">Complete this strategy: your saved conditions are preserved. Review the suggested buy/sell pair and risk settings, then save to enable monitoring and backtests.</div>}
      <FormProvider {...form}><Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit(save, invalid)}>
        <div className="strategy-builder-basics"><RhfInput control={form.control} name="name" label="Strategy name" placeholder="Name your buy/sell strategy" maxLength={50} /><RhfSelect control={form.control} name="entry.horizon" label="Trading horizon" onValueChange={setHorizon} options={Object.entries(horizonLabels).map(([value, label]) => ({ value, label }))} /><RhfSelect control={form.control} name="entry.cadence" label="Check rules on candle close" onValueChange={(value) => form.setValue('exit.cadence', value, { shouldDirty: true })} options={[{ value: '1m', label: '1-minute candle close' }, { value: '5m', label: '5-minute candle close' }, { value: '15m', label: '15-minute candle close' }, { value: 'daily', label: 'Daily · market close' }]} /></div>
        <Tabs activeKey={section} onChange={setSection} items={[
          { key: 'entry', label: <span className="strategy-side-tab buy">Buy rules <b>{count(draft.entry)}</b></span>, children: <div aria-label="Buy rule editor"><div className="strategy-builder-intro"><h3>Buy to enter</h3><p>Open a long position when these conditions match. Combine higher timeframe context with an execution trigger.</p></div><ConditionGroupsEditor tier="tactical" prefix="entry." /></div> },
          { key: 'exit', label: <span className="strategy-side-tab sell">Sell rules <b>{count(draft.exit)}</b></span>, children: <div aria-label="Sell rule editor"><div className="strategy-builder-intro"><h3>Sell to exit</h3><p>Close held shares when these conditions match. Stops, targets and session exits also apply. This does not open a short.</p></div><ConditionGroupsEditor tier="tactical" prefix="exit." /></div> },
          { key: 'risk', label: 'Risk & execution', children: <StrategyRiskFields /> },
        ]} />
        <div className="strategy-builder-actions"><Button icon={<FileTextOutlined aria-hidden />} onClick={form.handleSubmit(() => setPreviewOpen(true), invalid)}>Preview strategy</Button><div>{changed && saved && <Button icon={<UndoOutlined aria-hidden />} onClick={() => form.reset(structuredClone(saved))}>Discard changes</Button>}<Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} icon={<SaveOutlined aria-hidden />} disabled={!changed}>Save strategy</Button><Button icon={<ExperimentOutlined aria-hidden />} disabled={!plan || changed} onClick={() => plan && onBacktest(plan.entryRuleId)}>Backtest strategy</Button></div></div>
      </Form></FormProvider>
    </section>
    <p className="strategy-footnote">Save the buy/sell pair before starting monitoring. Signal Runner checks saved rules against the monthly qualified list. Manual buy and sell remain available in Paper Trading.</p>
    <Drawer open={previewOpen} onClose={() => setPreviewOpen(false)} title="Strategy summary" size={620}><StrategyDraftPreview draft={draft} changed={changed} saved={!!plan} /></Drawer>
    <Drawer className="strategy-ai-drawer" open={assistantOpen} destroyOnHidden onClose={closeAssistant} title="AI assistant · optional" size={1040} footer={<div className="strategy-ai-footer"><span>Applying replaces the builder draft. Review and save it separately.</span><Button onClick={closeAssistant}>Back to builder</Button><Button type="primary" disabled={!canApply} onClick={() => { if (!proposal) return; form.reset(structuredClone(proposal)); updateChat(key, { proposal: undefined }); closeAssistant(); message.success('Suggestion applied to the builder. You can edit every condition before saving.'); }}>Apply to builder</Button></div>}>
      <div className="strategy-ai-layout"><StrategyChat active={assistantOpen} messages={conversation?.messages ?? []} draft={proposal ?? draft} onUpdate={updateProposal} onBusyChange={setAssistantBusy} /><section className="strategy-preview" aria-label="AI suggestion preview"><div className="strategy-preview-heading"><span>PROPOSED RULES</span><small>{assistantBusy && proposal ? 'Updating · previous suggestion shown' : 'Not applied yet'}</small></div><div className="strategy-preview-body"><StrategyDraftPreview draft={proposal} changed saved={false} /></div></section></div>
    </Drawer>
  </div>;
}
