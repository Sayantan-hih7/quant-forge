import { useState } from 'react';
import { Alert, App, Button, Drawer, Form, Segmented, Tag } from 'antd';
import { CheckOutlined, CopyOutlined, PlusOutlined, SaveOutlined, FileTextOutlined } from '@ant-design/icons';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { ruleSchema } from '../schemas/ruleSchema';
import { newRule } from '../config/templates';
import { horizonLabels } from '../config/metrics';
import '../../../styles/scan-jobs.css';
import { RuleSummary } from './RuleSummary';
import { ConditionGroupsEditor } from './ConditionGroupsEditor';
import type { MonthlyCache, QualificationWorkspace, RuleDefinition, RuleTemplate, Tier } from '../types';

export function RuleBuilder({ workspace, cache, onSave, onActivate, initialId, tacticalOnly = false, onBacktest }: {
  workspace: QualificationWorkspace; cache?: MonthlyCache;
  onSave: (definition: RuleDefinition, id?: string) => string; onActivate: (id: string) => void; initialId?: string; tacticalOnly?: boolean; onBacktest?: (id: string) => void;
}) {
  const initial = workspace.templates.find((rule) => rule.id === initialId && (!tacticalOnly || rule.tier === 'tactical')) ?? workspace.templates.find((rule) => tacticalOnly ? rule.tier === 'tactical' : rule.id === workspace.activeBaseId)!;
  const [selectedId, setSelectedId] = useState<string | null>(initial.id);
  const [tier, setTier] = useState<Tier>(initial.tier);
  const [preview, setPreview] = useState<RuleDefinition | null>(null);
  const form = useForm<RuleDefinition>({ resolver: zodResolver(ruleSchema), defaultValues: initial, mode: 'onBlur' });
  const { modal, message } = App.useApp();
  const selected = workspace.templates.find((rule) => rule.id === selectedId);
  const move = (action: () => void) => { if (form.formState.isDirty) modal.confirm({ title: 'Discard unsaved rule changes?', content: 'Your saved templates and monthly cache will stay available.', okText: 'Discard changes', onOk: action }); else action(); };
  const load = (rule: RuleTemplate) => { setSelectedId(rule.id); setTier(rule.tier); form.reset(rule); setPreview(null); };
  const save = (definition: RuleDefinition, copy = false) => {
    const id = onSave(definition, copy ? undefined : selectedId ?? undefined);
    setSelectedId(id); form.reset(definition); setPreview(null);
    message.success(tier === 'base' ? 'Template saved. Current monthly candidates are unchanged.' : 'Trigger saved. Run it against the monthly cache to get new signals.');
  };
  return <div className="q-builder-layout">
    <aside className="q-template-library"><header><h3>Rule templates</h3><span>{workspace.templates.length}</span></header>
      {!tacticalOnly && <Segmented block value={tier} options={[{ value: 'base', label: 'Stage 1 · Base' }, { value: 'tactical', label: 'Stage 2 · Triggers' }]} onChange={(value) => move(() => load(workspace.templates.find((rule) => rule.tier === value)!))} />}
      <div className="q-template-list">{workspace.templates.filter((rule) => rule.tier === tier).map((rule) => <button key={rule.id} className={selectedId === rule.id ? 'selected' : ''} aria-label={`Edit template ${rule.name}`} aria-pressed={selectedId === rule.id} onClick={() => move(() => load(rule))}>
        <strong>{rule.name}</strong><small>{rule.groups.reduce((sum, group) => sum + group.conditions.length, 0)} conditions · v{rule.revision}{rule.tier === 'tactical' ? ' · ' + horizonLabels[rule.horizon] : ''}</small>{rule.id === workspace.activeBaseId && <span className="q-active-preset"><CheckOutlined /> Active monthly preset</span>}
      </button>)}</div>
      <Button block type="dashed" icon={<PlusOutlined aria-hidden />} onClick={() => move(() => { setSelectedId(null); form.reset(newRule(tier)); setPreview(null); })}>New template</Button>
      <p className="q-library-note">Trading templates apply only to the published monthly stock list. Manage qualification separately.</p>
    </aside>
    <div className="q-rule-editor"><div className="q-editor-heading"><div><span className="q-eyebrow">{tier === 'base' ? 'STAGE 1 · MONTHLY QUALIFICATION' : 'STAGE 2 · CACHED-UNIVERSE TRIGGER'}</span><h2>{selected?.name ?? 'New rule template'}</h2></div><Tag color={tier === 'base' ? 'blue' : 'purple'}>{tier === 'base' ? '6,200 stock universe' : `${cache?.candidates.length ?? 0} cached candidates`}</Tag></div>
      <FormProvider {...form}><Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit((definition) => save(definition))}>
        <div className="q-rule-basics"><RhfInput control={form.control} name="name" label="Template name" placeholder="Name this rule template" /><RhfInput control={form.control} name="description" label="Description" placeholder="What should this rule find?" /></div>
        {tier === 'tactical' && <div className="q-tactical-options"><RhfSelect control={form.control} name="horizon" label="Trading horizon" options={Object.entries(horizonLabels).map(([value, label]) => ({ value, label }))} /><RhfSelect control={form.control} name="side" label="Signal direction" options={[{ value: 'BUY', label: 'Buy alert' }, { value: 'SELL', label: 'Sell alert' }]} /><RhfSelect control={form.control} name="cadence" label="Run frequency" options={[{ value: '1m', label: 'Every 1 minute' }, { value: '5m', label: 'Every 5 minutes' }, { value: '15m', label: 'Every 15 minutes' }, { value: 'daily', label: 'Daily · market close' }]} /></div>}
        <ConditionGroupsEditor tier={tier} />
        <div className="q-editor-actions"><Button icon={<FileTextOutlined aria-hidden />} onClick={form.handleSubmit((definition) => setPreview(structuredClone(definition)))}>Preview rule</Button><div>{onBacktest && selected?.side === 'BUY' && <Button disabled={form.formState.isDirty} onClick={() => onBacktest(selected.id)}>Backtest saved rule</Button>}{selectedId && <Button icon={<CopyOutlined aria-hidden />} onClick={form.handleSubmit((definition) => save({ ...definition, name: definition.name.slice(0, 53) + ' copy' }, true))}>Save as copy</Button>}<Button type="primary" htmlType="submit" icon={<SaveOutlined aria-hidden />} disabled={!!selectedId && !form.formState.isDirty}>Save template</Button></div></div>
      </Form></FormProvider>
      {tier === 'base' && <div className="q-active-rule-footer"><div><strong>{selectedId === workspace.activeBaseId ? 'Selected for the next monthly run' : 'Use this preset for the next monthly run'}</strong><p>{cache ? `Published universe uses ${cache.rule.name} v${cache.rule.revision}.` : 'The next monthly scan will use this preset.'} Activating a preset does not start a scan. Queue and review scans in Monthly Qualified Universe.</p></div><Button disabled={!selectedId || form.formState.isDirty || selectedId === workspace.activeBaseId} onClick={() => { onActivate(selectedId!); message.success('Monthly preset selected. No scan has started.'); }}>Activate preset</Button></div>}
      {tier === 'tactical' && <Alert type="info" showIcon title="Each condition carries its own timeframe." description="Combine Daily or 4-hour context with a 5-minute or 15-minute entry condition. All trigger checks stay inside the monthly cache." />}
    </div>
    <Drawer open={!!preview} onClose={() => setPreview(null)} title="Rule summary" size={560} footer={<Button onClick={() => setPreview(null)}>Back to editor</Button>}>
      {preview && <><RuleSummary rule={preview} /><p className="q-summary-note">This is a summary of your draft. No stocks have been scanned. Save the template, then queue a separate scan when you are ready.</p></>}
    </Drawer>
  </div>;
}
