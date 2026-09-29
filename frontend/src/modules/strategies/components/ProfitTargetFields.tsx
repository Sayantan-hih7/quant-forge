import { useEffect } from 'react';
import { Button, Form, Select, Segmented, Space, Tag, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { RhfInputNumber } from '../../../components/forms';
import type { TradingPlanDraft } from '../types/tradingPlan';
import { targetBasis, targetValue, type TargetBasis } from '../schemas/exitTargetsSchema';
import { convertTarget, targetIllustration, targetMoney } from '../utils/targetValues';
import { referenceRisk, stopPlan } from '../utils/stopSettings';
import { useRiskExample } from '../hooks/useRiskExample';

function PartialTargets() {
  const { entry: referenceEntry, atr, signalLow } = useRiskExample();
  const { control, setValue, unregister, formState: { errors } } = useFormContext<TradingPlanDraft>();
  const { fields, replace } = useFieldArray({ control, name: 'risk.exitTargets' });
  const targets = useWatch({ control, name: 'risk.exitTargets' }) ?? [];
  const risk = useWatch({ control, name: 'risk' });
  const initialRisk = referenceRisk(risk, referenceEntry, referenceEntry && atr ? referenceEntry - atr * risk.atrMultiplier : null, signalLow);
  const stopTargetReferences = targets.flatMap(target => target.moveStopTo ? [target.moveStopTo] : []);
  const referencedTargets = Object.values(stopPlan(risk) ?? {}).filter(rule => rule?.trigger === 'target').map(rule => rule.at).concat(stopTargetReferences);
  const basis = targets[0] ? targetBasis(targets[0]) : 'percent';
  useEffect(() => {
    // RHF retains defaults for previously mounted controls. Remove the inactive
    // unit's fields and defaults so a saved currency value cannot return on submit.
    for (let index = 0; index < fields.length; index++)
      unregister(`risk.exitTargets.${index}.${basis === 'percent' ? 'value' : 'profitPercent'}`, { keepDirty: true });
  }, [basis, fields.length, unregister]);
  const last = targets.length - 1;
  const lastClose = targets[last]?.closePercent;
  const remainder = Math.round((100 - targets.slice(0, last).reduce((sum, t) => sum + (Number(t.closePercent) || 0), 0)) * 100) / 100;
  useEffect(() => {
    if (last >= 1 && lastClose !== remainder) setValue(`risk.exitTargets.${last}.closePercent`, remainder, { shouldDirty: true, shouldValidate: true });
  }, [last, remainder, lastClose, setValue]);
  const error = errors.risk?.exitTargets;
  return <>
    <div className="strategy-target-controls">
      <Form.Item label="Enter targets as" htmlFor="profit-target-unit">
        <Select id="profit-target-unit" value={basis} options={[
          { value: 'risk', label: 'Initial risk (R)' }, { value: 'percent', label: 'Gain (%)' }, { value: 'amount', label: 'Gain per share (₹)' }, { value: 'price', label: 'Exact target price (₹)' },
        ]} onChange={(unit: TargetBasis) => replace(targets.map(target => convertTarget(target, unit, referenceEntry, initialRisk)))} />
      </Form.Item>
    </div>
    <p className="muted">The Example calculator below shows equivalent prices and supports unit conversion. Without the required example inputs, changing units clears target values for explicit entry.</p>
    <p className="muted">{basis === 'risk' ? 'Targets multiply the original risk per share. For entry ₹100 and initial SL ₹96, 2R = ₹108, 4R = ₹116 and 5R = ₹120.' : basis === 'price'
      ? 'Exact prices apply to every stock using this strategy. An entry at or above Target 1 is skipped in backtests and rejected in paper trading.'
      : basis === 'amount' ? 'Enter the rupee gain per share above the actual filled entry, e.g. ₹10 gain on a ₹500 entry gives a ₹510 target.'
      : 'Enter the percentage gain above the actual filled entry, e.g. 2% on a ₹500 entry gives a ₹510 target.'} Exit sizes use the original position. The final target closes all remaining shares.</p>
    <div className="strategy-target-list">{fields.map((field, index) => {
      const example = targets[index] ? targetIllustration(targets[index], referenceEntry, initialRisk) : null;
      return <div className="strategy-target-row" key={field.id}>
      <Tag color="blue">Target {index + 1}</Tag>
      <div><RhfInputNumber control={control} name={`risk.exitTargets.${index}.${basis === 'percent' ? 'profitPercent' : 'value'}`} label={`Target ${index + 1} ${basis === 'risk' ? 'multiple (R)' : basis === 'percent' ? 'gain (%)' : basis === 'amount' ? 'gain per share (₹)' : 'price (₹)'}`} min={basis === 'percent' || basis === 'risk' ? 0.1 : 0.01} max={basis === 'risk' ? 20 : basis === 'percent' ? 1000 : 10000000} step={basis === 'percent' || basis === 'risk' ? 0.5 : 1} precision={2} />
        {example && <div className={`strategy-target-equivalent ${example.gain <= 0 ? 'negative' : 'muted'}`} data-testid={`target-${index + 1}-equivalent`}>
          {example.gain <= 0 ? 'Target must be above the entry price.' : <>Target {targetMoney(example.price)} · +{targetMoney(example.gain)} / share · +{example.percent.toFixed(2)}%</>}
        </div>}
      </div>
      <RhfInputNumber control={control} name={`risk.exitTargets.${index}.closePercent`} label={`Target ${index + 1} close (%)`} min={1} max={99} step={1} disabled={index === last} />
      {index !== last && <Controller control={control} name={`risk.exitTargets.${index}.moveStopTo`} render={({ field, fieldState }) => <Form.Item label={`After Target ${index + 1} fills, move SL to`} htmlFor={field.name} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
        <Select id={field.name} value={field.value ?? 'keep'} options={[{ value: 'keep', label: 'Keep current stop' }, { value: 0, label: 'Entry price' }, ...Array.from({ length: index }, (_, i) => ({ value: i + 1, label: `Target ${i + 1} price` }))]} onChange={value => field.onChange(value === 'keep' ? null : value)} />
      </Form.Item>} />}
      {index === last ? <span className="muted">Remaining shares</span> : <Tooltip title={referencedTargets.some(at => index < at) ? 'Change or disable the target-based stop adjustment before removing this target.' : undefined}><span><Button type="text" danger icon={<DeleteOutlined />} aria-label={`Remove Target ${index + 1}`} disabled={fields.length <= 2 || referencedTargets.some(at => index < at)} onClick={() => replace(targets.filter((_, i) => i !== index))} /></span></Tooltip>}
    </div>; })}</div>
    {remainder <= 0 && <p role="alert" className="negative">Leave at least 1% for the final target.</p>}
    {(error?.message || error?.root?.message) && <p role="alert" className="negative">{error.message ?? error.root?.message}</p>}
    <Space wrap className="mb-5"><Button icon={<PlusOutlined aria-hidden />} disabled={fields.length >= 5 || remainder < 2} onClick={() => {
      const share = Math.floor(remainder / 2);
      const previous = targetValue(targets[last]);
      const value = previous == null ? null : Math.round((previous + 2) * 100) / 100;
      replace([...targets.slice(0, last), { ...targets[last], closePercent: share }, { basis, ...(basis === 'percent' ? { profitPercent: value } : { value }), closePercent: remainder - share }]);
    }}>Add target</Button><span className="muted">2–5 targets · whole shares only</span></Space>
    <p className="muted">Target stop steps apply after shares actually sell. They never lower a higher stop. The final target closes the position. Small allocations round down to whole shares; unused shares move to later targets.</p>
  </>;
}

export function ProfitTargetFields() {
  const { control, setValue } = useFormContext<TradingPlanDraft>();
  const targets = useWatch({ control, name: 'risk.exitTargets' });
  const risk = useWatch({ control, name: 'risk' });
  const targetAdjustment = Object.values(stopPlan(risk) ?? {}).some(rule => rule?.trigger === 'target');
  const partial = !!targets?.length;
  return <section className="strategy-risk-section" aria-label="Profit-taking plan"><h4>Profit targets</h4><p className="muted">Sell some or all shares when price reaches a target. Moving a stop is a separate choice below.</p>
    <Segmented aria-label="Profit-taking mode" value={partial ? 'partial' : 'single'} options={[{ value: 'single', label: 'Single target', disabled: targetAdjustment }, { value: 'partial', label: 'Partial exits' }]} onChange={value => {
      setValue('risk.breakevenAfterTarget1', false, { shouldDirty: true });
      setValue('risk.exitTargets', value === 'partial' ? [{ profitPercent: 2, closePercent: 50 }, { profitPercent: 4, closePercent: 50 }] : undefined, { shouldDirty: true, shouldValidate: true });
    }} />
    {targetAdjustment && <p className="risk-inline-explanation">A stop adjustment depends on a partial target. Change or disable that adjustment below before switching to a single target or removing a target it depends on.</p>}
    {partial ? <PartialTargets /> : <div className="mt-3"><RhfInputNumber control={control} name="risk.targetR" label="Profit target (R)" min={0.5} max={10} step={0.5} /><p className="muted">Close the full position at this target. 2R means twice the initial stop distance.</p></div>}
    <p className="strategy-footnote">A sell rule, stop-loss or session close exits all remaining shares. Targets run automatically in both paper execution modes.</p>
  </section>;
}
