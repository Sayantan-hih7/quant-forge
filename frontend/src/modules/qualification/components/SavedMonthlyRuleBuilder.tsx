import { GuidanceNote } from '../../../components/feedback/GuidanceNote';
import { MonthlyRuleReview } from './MonthlyRuleReview';
import { useState } from 'react';
import { Alert, App, Button, Drawer, Form, Space, Tag } from 'antd';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiClient } from '../../../services/apiClient';
import { createMonthlyRuleSchema } from '../schemas/monthlyRuleSchema';
import { initialMonthlyRule } from '../config/monthlyFields';
import { MonthlyConditionEditor } from './MonthlyConditionEditor';
import { MonthlyRuleSummary } from './MonthlyRuleSummary';
import type { MonthlyRuleDefinition } from '../types/monthly';
import type { QualificationState, RuleCapabilities } from '../types/backend';
import { RobotOutlined } from '@ant-design/icons';
import { RuleAssistantDrawer } from '../../../components/forms/RuleAssistantDrawer';
import { monthlyStarters } from '../config/assistantPrompts';

// Registering newly optional RHF fields must not mark an untouched legacy rule dirty.
const editableDefaults = (rule: MonthlyRuleDefinition): MonthlyRuleDefinition => ({ ...rule,
  groups: rule.groups.map(group => ({ ...group, conditions: group.conditions.map(condition => ({
    settings: undefined, compareSettings: undefined, period: undefined, offset: undefined, comparePeriod: undefined, compareOffset: undefined, ...condition,
  })) })),
});

export function SavedMonthlyRuleBuilder({ state, capabilities, refresh, visible = true }: { visible?: boolean; state: QualificationState; capabilities: RuleCapabilities; refresh: () => Promise<void> }) {
  const { message } = App.useApp();
  const [revision, setRevision] = useState(state.rule?.revision ?? 0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [summary, setSummary] = useState<MonthlyRuleDefinition | null>(null), [busy, setBusy] = useState(false);
  const ruleSchema = createMonthlyRuleSchema(capabilities.choices);
  const form = useForm<MonthlyRuleDefinition>({ resolver: zodResolver(ruleSchema), defaultValues: editableDefaults(state.rule?.rule ?? initialMonthlyRule) });
  const draft = useWatch({control:form.control}) as MonthlyRuleDefinition;
  const active = state.runs.some(x => ['queued', 'running'].includes(x.status));
  async function save(rule: MonthlyRuleDefinition, run: boolean) {
    setBusy(true);
    try {
      const response = await apiClient.put<{ revision: number }>('/qualification/rule', { rule, expectedRevision: revision });
      setRevision(response.data.revision); form.reset(editableDefaults(rule));
      if (run) await apiClient.post('/qualification/runs');
      message.success(run ? 'Rule saved. Monthly scan queued.' : 'Monthly rule saved.'); await refresh();
    } catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  return <div className="monthly-rule-builder">
    <div className="q-section-heading"><div><h2>Monthly qualification rules</h2><p>One saved rule for the current month’s stock universe.</p></div><Tag>{form.formState.isDirty || !state.rule ? 'Draft changes' : 'Saved'}</Tag></div>
    <GuidanceNote type="info" showIcon className="mb-5" title="Completed monthly candles" description="Technical conditions use completed months. Company and exchange facts use dated, available reports. A missing value is reported as unavailable; it never silently passes a condition." />
    {state.rule && state.rule.revision !== revision && <Alert type="warning" className="mb-5" title="The saved rule changed in another tab. Reload before saving this draft." />}
    <div className="q-editor-actions"><span className="muted">Build conditions below, or start with an AI suggestion.</span><Button icon={<RobotOutlined aria-hidden />} onClick={() => setAssistantOpen(true)}>AI assistant</Button></div>
    <ol className="qualification-flow"><li><b>1 · Set monthly rules</b><span>Choose the qualities your stock list needs.</span></li><li><b>2 · Save and scan</b><span>Data loads first; progress continues in the background.</span></li><li><b>3 · Review and publish</b><span>Your trading universe updates after your review.</span></li></ol>
    <FormProvider {...form}><Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit(rule => save(rule, false))}>
      <MonthlyConditionEditor capabilities={capabilities} />
      <MonthlyRuleReview visible={visible} rule={draft} onApply={next=>form.setValue('groups',next.groups,{shouldDirty:true,shouldValidate:true})}/>
      <div className="q-editor-actions monthly-save-actions"><span className="muted">{form.formState.isDirty?'Unsaved changes':'Saved rule'} · Saving alone does not change your published stocks.</span><Button onClick={form.handleSubmit(setSummary)}>Preview rule</Button><Space>
        <Button htmlType="submit" loading={busy} disabled={!form.formState.isDirty && !!state.rule}>Save rule</Button>
        <Button type="primary" loading={busy} disabled={active || !form.formState.isDirty && !state.canRun && !!state.rule} onClick={form.handleSubmit(rule => save(rule, true))}>Save and run</Button>
      </Space></div>
    </Form></FormProvider>
    <Drawer title="Rule summary" open={!!summary} onClose={() => setSummary(null)} size={560}>{summary && <MonthlyRuleSummary rule={summary} />}</Drawer>
    <RuleAssistantDrawer<MonthlyRuleDefinition> open={assistantOpen} onClose={() => setAssistantOpen(false)} title="Monthly rule AI assistant · optional" starters={monthlyStarters}
      currentDraft={form.getValues()} validate={value => ruleSchema.parse(value)} preview={proposal => <MonthlyRuleSummary rule={proposal} />}
      onApply={proposal => {
        form.setValue('groups', structuredClone(proposal.groups), { shouldDirty: true, shouldValidate: true });
        form.setValue('logic', proposal.logic, { shouldDirty: true });
        message.success('Suggestion applied to the draft. Review and save when ready.');
      }} />
  </div>;
}
