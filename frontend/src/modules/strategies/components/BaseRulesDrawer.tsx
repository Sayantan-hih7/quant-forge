import { Alert, App, Button, Drawer, Form } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput, RhfInputNumber, RhfSelect } from '../../../components/forms';
import { baseRulesSchema, type BaseRulesValues } from '../schemas/workspaceSchema';
import { defaultRules, qualifyMockUniverse } from '../api/mockUniverse';
import { formatMonth } from '../utils/monthlyCycle';
import type { MonthlyBase, QualificationRules } from '../types/workspace';

export function BaseRulesDrawer({ base, targetMonth, onClose, onSave }: {
  base?: MonthlyBase; targetMonth: string; onClose: () => void; onSave: (name: string, rules: QualificationRules) => void;
}) {
  const { message } = App.useApp();
  const { control, handleSubmit } = useForm<BaseRulesValues>({
    resolver: zodResolver(baseRulesSchema), mode: 'onBlur',
    defaultValues: { name: base?.name ?? '', ...(base?.plannedRules ?? base?.current.rules ?? defaultRules) },
  });
  const values = useWatch({ control });
  const parsed = baseRulesSchema.safeParse(values);
  const previewCount = parsed.success ? qualifyMockUniverse(parsed.data, targetMonth).length : null;
  const submit = ({ name, ...rules }: BaseRulesValues) => {
    onSave(name, rules);
    message.success(base ? 'Rules saved for the next monthly refresh. Current stocks are unchanged.' : 'Monthly base saved. You can now attach trading strategies.');
    onClose();
  };
  return <Drawer title={base ? `Plan ${formatMonth(targetMonth, true)} base rules` : 'Create a monthly base'} open size={470} onClose={onClose}
    footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="primary" htmlType="submit" form="base-rules-form">{base ? 'Save planned rules' : 'Qualify and save base'}</Button></div>}>
    <Alert className="mb-5" type="info" showIcon title={base ? `Effective at the ${formatMonth(targetMonth)} refresh` : `First snapshot · ${formatMonth(targetMonth)}`}
      description={base ? 'Editing these rules does not re-scan or replace the saved stock list. Apply them at the next monthly review.' : 'Run qualification once, save the result, and reuse it for your trading strategies.'} />
    <Form id="base-rules-form" layout="vertical" onFinish={handleSubmit(submit)} requiredMark={false}>
      <RhfInput name="name" control={control} label="Base name" placeholder="e.g. Quality growth" disabled={!!base} />
      <RhfSelect name="source" control={control} label="Starting universe" options={['NSE 500', 'NSE 200'].map((value) => ({ value, label: value + ' · demo' }))} />
      <RhfSelect name="trend" control={control} label="Monthly trend rule" options={[{ value: 'above-ema50', label: 'Monthly close above 50 EMA' }, { value: 'above-ema200', label: 'Monthly close above 200 EMA' }, { value: 'any', label: 'No trend filter' }]} />
      <RhfInputNumber name="minMomentum" control={control} label="Minimum 6-month return (%)" step={1} />
      <RhfInputNumber name="minTurnover" control={control} label="Minimum average daily turnover (₹ Cr)" step={1} />
      <div className="qualification-preview"><small>ILLUSTRATIVE QUALIFICATION PREVIEW</small><strong>{previewCount ?? '—'} <span>stocks</span></strong><p>Calculated from synthetic sample data. Saving does not call a market scanner.</p></div>
    </Form>
  </Drawer>;
}
