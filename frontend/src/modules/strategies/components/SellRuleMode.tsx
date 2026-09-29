import { Form, Select } from 'antd';
import { useFormContext, useWatch } from 'react-hook-form';
import type { TradingPlanDraft } from '../types/tradingPlan';
import { defaultCondition } from '../../qualification/config/metrics';

export function SellRuleMode() {
  const { control, setValue, clearErrors } = useFormContext<TradingPlanDraft>();
  const enabled = useWatch({ control, name: 'exit.enabled' }) !== false;
  return <div className="strategy-exit-mode">
    <Form.Item label="Exit plan" htmlFor="strategy-exit-mode">
      <Select id="strategy-exit-mode" value={enabled ? 'rules' : 'protection'} options={[
        { value: 'rules', label: 'Sell conditions, stops and targets' },
        { value: 'protection', label: 'Stops and targets only' },
      ]} onChange={value => {
        setValue('exit.enabled', value === 'rules', { shouldDirty: true });
        setValue('exit.groups', value === 'rules' ? [{ logic: 'AND', conditions: [{ ...defaultCondition, left: 'close', leftFrame: '1d', operator: 'lt', rightType: 'indicator', right: 'ema21', rightFrame: '1d' }] }] : [], { shouldDirty: true });
        clearErrors('exit');
      }} />
    </Form.Item>
    <p className="muted">{enabled ? 'A sell condition can close all remaining shares before a target is reached.' : 'No indicator-based sell signal. Your stop and targets manage exits; manual sells and intraday square-off still work.'}</p>
  </div>;
}
