import { Collapse, Form, Select, Switch } from 'antd';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { RhfInputNumber, RhfSelect } from '../../../components/forms';
import type { TradingPlanDraft } from '../types/tradingPlan';
import type { StopManagement } from '../schemas/stopSettingsSchema';
import { stopPlan } from '../utils/stopSettings';

export function StopManagementFields() {
  const { control, setValue, unregister } = useFormContext<TradingPlanDraft>();
  const risk = useWatch({ control, name: 'risk' }), plan = stopPlan(risk);
  const immediate = risk.stopMode === 'trailing';
  const configured = !!plan?.breakeven || !!plan?.trailing || immediate;
  const hasTargetSteps = risk.exitTargets?.some(target => target.moveStopTo != null);
  const [expanded, setExpanded] = useState(false);
  function update(next: StopManagement) {
    setValue('risk.breakevenAfterTarget1', false, { shouldDirty: true });
    unregister('risk.stopManagement', { keepDirty: true });
    setValue('risk.stopManagement', next.breakeven || next.trailing ? next : undefined, { shouldDirty: true, shouldValidate: true });
  }
  const choices = Array.from({ length: Math.max(0, (risk.exitTargets?.length ?? 0) - 1) }, (_, index) => ({ value: index + 1, label: 'Target ' + (index + 1) + ' fills' }));
  return <section className="strategy-risk-section" id="stop-adjustments" aria-label="Move or trail the stop-loss">
    <Collapse activeKey={configured || expanded ? ['adjust'] : []} onChange={keys => setExpanded(keys.includes('adjust'))} items={[{
      key: 'adjust', label: 'Move or trail the stop-loss', extra: <span className="muted">{configured ? 'Enabled' : hasTargetSteps ? 'Target steps set above' : 'Optional · off'}</span>,
      children: <>
        <p className="muted">{hasTargetSteps ? 'Your target stop steps above remain active. Add an earlier move to entry or continuous trailing here if needed. All adjustments use the same stop; the highest level wins.' : 'These settings raise the same stop created at entry. They do not sell shares by themselves. Leave them off to keep the initial stop unchanged.'}</p>
        {(['breakeven', 'trailing'] as const).map(key => {
          const rule = plan?.[key], title = key === 'breakeven' ? 'Move stop to entry' : 'Trail the remaining position';
          const enabled = !!rule || key === 'trailing' && immediate;
          return <div className="strategy-stop-rule" key={key}>
            <label className="strategy-stop-toggle"><Switch checked={enabled} aria-label={title} onChange={on => {
              const next = { ...plan };
              if (on) {
                if (key === 'breakeven') next.breakeven = { trigger: 'risk', at: 1 };
                else next.trailing = { trigger: 'risk', at: 2, distanceR: 1 };
              } else {
                delete next[key];
                if (key === 'trailing' && immediate) setValue('risk.stopMode', 'fixed', { shouldDirty: true });
              }
              setExpanded(true); update(next);
            }} /><strong>{title}</strong></label>
            {enabled && key === 'trailing' && <Form.Item className="mt-3" label="Start trailing" htmlFor="trailing-start">
              <Select id="trailing-start" value={immediate ? 'immediate' : 'delayed'} options={[
                { value: 'immediate', label: 'From entry · percentage distance', disabled: !['fixed', 'trailing'].includes(risk.stopMode) },
                { value: 'delayed', label: 'After a profit level or target · R distance' },
              ]} onChange={value => {
                const next = { ...plan };
                if (value === 'immediate') { delete next.trailing; setValue('risk.stopMode', 'trailing', { shouldDirty: true }); }
                else { if (immediate) setValue('risk.stopMode', 'fixed', { shouldDirty: true }); next.trailing = { trigger: 'risk', at: 2, distanceR: 1 }; }
                update(next);
              }} />
            </Form.Item>}
            {enabled && key === 'trailing' && immediate && <p className="muted">Follows the highest price from entry at the {risk.stopPercent}% distance set under Initial stop-loss. The stop never moves down.</p>}
            {enabled && key === 'trailing' && !['fixed', 'trailing'].includes(risk.stopMode) && <p className="muted">Trailing from entry is available with a percentage initial stop. This initial stop supports delayed trailing below.</p>}
            {rule && !(key === 'trailing' && immediate) && <div className="strategy-stop-grid">
              <Form.Item label="Activate when" htmlFor={'stop-' + key + '-trigger'}>
                <Select id={'stop-' + key + '-trigger'} value={rule.trigger} options={[{ value: 'risk', label: 'Price reaches a profit multiple (R)' }, { value: 'target', label: 'A partial target fills', disabled: !choices.length }]} onChange={trigger => update({ ...plan, [key]: { ...rule, trigger, at: 1 } })} />
              </Form.Item>
              {rule.trigger === 'risk' ? <RhfInputNumber control={control} name={`risk.stopManagement.${key}.at`} label={key === 'breakeven' ? 'Move to entry at profit (R)' : 'Start trailing at profit (R)'} min={0.1} max={20} step={0.5} />
                : risk.breakevenAfterTarget1 && !risk.stopManagement ? <Form.Item label="Move to entry after" htmlFor="legacy-breakeven-target"><Select id="legacy-breakeven-target" value={rule.at} options={choices} onChange={at => update({ breakeven: { trigger: 'target', at } })} /></Form.Item>
                : <RhfSelect control={control} name={`risk.stopManagement.${key}.at`} label={key === 'breakeven' ? 'Move to entry after' : 'Start trailing after'} options={choices} onValueChange={at => update({ ...plan, [key]: { ...rule, at } })} />}
              {key === 'trailing' && <RhfInputNumber control={control} name="risk.stopManagement.trailing.distanceR" label="Trail behind the highest price (R)" min={0.1} max={20} step={0.5} />}
            </div>}
          </div>;
        })}
        <p className="muted">1R stays equal to the original entry-to-stop distance. A price trigger can move the stop before any shares are sold; a target trigger waits for a fill. Entry-price breakeven excludes costs.</p>
      </>,
    }]} />
  </section>;
}
