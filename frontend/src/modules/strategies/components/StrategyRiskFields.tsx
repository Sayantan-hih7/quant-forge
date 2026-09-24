import { useFormContext, useWatch } from 'react-hook-form';
import { RhfInputNumber, RhfSelect, RhfSwitch } from '../../../components/forms';
import type { TradingPlanDraft } from '../types/tradingPlan';

export function StrategyRiskFields() {
  const { control } = useFormContext<TradingPlanDraft>();
  const mode = useWatch({ control, name: 'risk.stopMode' });
  return <div className="strategy-risk-fields"><div className="strategy-builder-intro"><h3>Capital & protection</h3><p>These defaults follow the saved buy/sell pair into Backtests. Manual trade controls are available in Paper Trading.</p></div><div className="strategy-form-grid">
    <RhfInputNumber control={control} name="risk.initialCapital" label="Initial capital (₹)" min={1000} step={10000} />
    <RhfInputNumber control={control} name="risk.riskPercent" label="Risk per trade (%)" min={0.1} max={5} step={0.1} />
    <RhfInputNumber control={control} name="risk.maxPositions" label="Max open positions" min={1} max={20} precision={0} />
    <RhfSelect control={control} name="risk.stopMode" label="Stop-loss mode" options={[{ value: 'ATR', label: 'ATR-based' }, { value: 'fixed', label: 'Fixed percentage' }, { value: 'trailing', label: 'Trailing percentage' }]} />
    {mode === 'ATR' ? <><RhfInputNumber control={control} name="risk.atrPeriod" label="ATR period" min={2} max={100} precision={0} /><RhfInputNumber control={control} name="risk.atrMultiplier" label="ATR multiplier" min={0.5} max={10} step={0.5} /></> : <RhfInputNumber control={control} name="risk.stopPercent" label="Stop distance (%)" min={0.1} max={25} step={0.1} />}
    <RhfInputNumber control={control} name="risk.targetR" label="Profit target (R)" min={0.5} max={10} step={0.5} />
    <RhfSwitch control={control} name="risk.overnight" label="Allow overnight holding" />
    <RhfSelect control={control} name="risk.timeframe" label="Execution interval" options={['1m', '5m', '15m', '1h', '1d'].map(value => ({ value, label: value === '1d' ? 'Daily' : value }))} />
    <RhfInputNumber control={control} name="risk.slippagePercent" label="Slippage per side (%)" min={0} max={2} step={0.01} />
    <RhfInputNumber control={control} name="risk.feePercent" label="Estimated fees per side (%)" min={0} max={2} step={0.01} />
  </div><p className="strategy-footnote">The first matching sell rule, protective stop, profit target or session exit closes held shares. Overnight off means 15:15 IST square-off.</p></div>;
}
