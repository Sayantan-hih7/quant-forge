import { useEffect, useState, type ReactNode } from 'react';
import { Alert, App, Button, Drawer, Form, Tag } from 'antd';
import { FileTextOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { monthlyRuleSchema } from '../schemas/monthlyRuleSchema';
import { MonthlyConditionEditor } from './MonthlyConditionEditor';
import { MonthlyRuleSummary } from './MonthlyRuleSummary';
import { differsFromPublished, monthlyScanPending } from '../utils/monthlyRuleChanges';
import { useQualificationStore } from '../store/qualificationStore';
import type { QualificationWorkspace } from '../types';
import type { MonthlyRuleDefinition } from '../types/monthly';

export function MonthlyRuleBuilder({ workspace, owner, month, onQueued, onDirtyChange, activity }: { workspace: QualificationWorkspace; owner: string; month: string; onQueued: () => void; onDirtyChange: (dirty: boolean) => void; activity?: ReactNode }) {
  const form = useForm<MonthlyRuleDefinition>({ resolver: zodResolver(monthlyRuleSchema), defaultValues: workspace.monthlyRule, mode: 'onBlur' });
  const [summary, setSummary] = useState<MonthlyRuleDefinition | null>(null);
  const save = useQualificationStore((state) => state.saveMonthlyRule);
  const queue = useQualificationStore((state) => state.queueBaseScan);
  const { message } = App.useApp();
  const dirty = form.formState.isDirty;
  const draft = useWatch({ control: form.control }) as MonthlyRuleDefinition;
  const pending = monthlyScanPending(workspace, month);
  const changedFromPublished = differsFromPublished(draft, workspace.caches[month]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const submit = (definition: MonthlyRuleDefinition, run: boolean) => {
    if (!save(owner, definition)) return;
    form.reset(definition);
    if (run) {
      if (queue(owner)) { message.info('Rule saved. Monthly scan queued.'); onQueued(); }
      else message.info('Rule saved. There are no changes to scan, or a scan is already pending.');
    } else message.success('Rule saved. Published stocks stay unchanged until a scan is completed and published.');
  };
  return <div className="monthly-rule-builder">
    <div className="q-section-heading"><div><h2>Monthly qualification rules</h2><p>Edit conditions, then save your rule or save and start a scan.</p></div><Tag color={dirty ? 'orange' : 'blue'}>{dirty ? 'Unsaved changes' : 'Saved rules'}</Tag></div>
    <Alert className="monthly-data-note" type="info" showIcon title="Monthly data only" description="Technical filters use completed monthly candles. Fundamentals, news, ownership and other filters use the month-end snapshot. Daily, weekly and intraday rules are unavailable here." />
    <FormProvider {...form}><Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit((definition) => submit(definition, false))}>
      <MonthlyConditionEditor />
      <div className="q-editor-actions"><Button icon={<FileTextOutlined aria-hidden />} onClick={form.handleSubmit((definition) => setSummary(structuredClone(definition)))}>Preview rule</Button><div><Button htmlType="submit" disabled={!dirty && workspace.monthlyRuleSaved} icon={<SaveOutlined aria-hidden />}>Save rule</Button><Button type="primary" disabled={pending || !changedFromPublished} icon={<PlayCircleOutlined aria-hidden />} onClick={form.handleSubmit((definition) => submit(definition, true))}>Save and run</Button></div></div>
    </Form></FormProvider>
    {activity}
    <Drawer title="Rule summary" open={!!summary} onClose={() => setSummary(null)} size={580} footer={<Button onClick={() => setSummary(null)}>Back to editor</Button>}>{summary && <MonthlyRuleSummary rule={summary} />}</Drawer>
  </div>;
}
