import { useEffect, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { Button, Collapse, Form, Select, Tag } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { RhfInputNumber, RhfSelect } from '../../../components/forms';
import type { TradingPlanDraft } from '../types/tradingPlan';
import { ProfitTargetFields } from './ProfitTargetFields';
import { StopManagementFields } from './StopManagementFields';
import { RiskExampleCalculator } from './RiskExampleCalculator';
import { RiskExampleContext } from '../hooks/useRiskExample';
import { FixedPriceNotice } from './FixedPriceNotice';
import { targetMoney } from '../utils/targetValues';
import type { AiExample } from '../../../services/aiAssistant';

export function StrategyRiskFields({ example, onExampleChange, onAskAi }: { example?: AiExample; onExampleChange?: (value: AiExample) => void; onAskAi?: () => void }) {
  const { control, setValue, unregister } = useFormContext<TradingPlanDraft>();
  const risk = useWatch({ control, name: 'risk' });
  const mode = risk.stopMode, overnight = risk.overnight, entryOrderType = risk.entryOrderType ?? 'market';
  const [localEntry, setLocalEntry] = useState<number | null>(null), [localAtr, setLocalAtr] = useState<number | null>(null);
  const [signalLow, setSignalLow] = useState<number | null>(null);
  const entry = example ? example.entry : localEntry, atr = example ? example.atr : localAtr;
  const setEntry = (value: number | null) => onExampleChange ? onExampleChange({ entry: value, atr }) : setLocalEntry(value);
  const setAtr = (value: number | null) => onExampleChange ? onExampleChange({ entry, atr: value }) : setLocalAtr(value);
  useEffect(() => {
    if (mode !== 'price' && mode !== 'amount') unregister('risk.stopValue', { keepDirty: true });
    if (entryOrderType !== 'limit') unregister('risk.entryLimitPrice', { keepDirty: true });
  }, [mode, entryOrderType, unregister]);
  const timeframeOptions = ['1m', '5m', '15m', '1h', '1d'].filter(value => overnight || value !== '1d').map(value => ({ value, label: value === '1d' ? 'Daily' : value === '1h' ? 'Hourly' : value.slice(0, -1) + ' minute' }));
  const frameLabel = timeframeOptions.find(x => x.value === risk.timeframe)?.label.toLowerCase();
  return <RiskExampleContext.Provider value={{ entry, atr, signalLow, setSignalLow, setEntry, setAtr }}><div className="strategy-risk-fields">
    <div className="strategy-builder-intro"><h3>Position size & exits</h3><p>Set the starting protection, decide when to take profit, then optionally move that same stop upward.</p></div>
    {onAskAi && <div className="risk-ai-entry"><div><strong>Tell us how you would manage a trade</strong><p>Use an example in your own words. The assistant asks about missing details and explains the settings before you apply them.</p></div><Button icon={<RobotOutlined aria-hidden />} onClick={onAskAi}>Explain my risk plan</Button></div>}
    <div className="risk-section-flow" aria-label="Position protection flow"><span>Initial stop-loss<small>Protection from the buy fill</small></span><span>Profit targets<small>Sell some or all shares</small></span><span>Move or trail the stop<small>Protect the shares still held</small></span></div>
    <section aria-label="Capital and position size"><h4>Capital & position size</h4><div className="strategy-form-grid">
      <RhfInputNumber control={control} name="risk.initialCapital" label="Initial capital (₹)" min={1000} step={10000} />
      <RhfInputNumber control={control} name="risk.riskPercent" label="Risk per trade (%)" min={0.1} max={5} step={0.1} />
      <RhfInputNumber control={control} name="risk.maxPositions" label="Max open positions" min={1} max={20} precision={0} />
    </div><p className="risk-inline-explanation">Starting risk budget: <strong>{Number.isFinite(risk.initialCapital * risk.riskPercent) ? targetMoney(risk.initialCapital * risk.riskPercent / 100) : 'Enter capital and risk'}</strong> per trade. Share quantity uses this budget divided by the initial stop distance, subject to available cash. This is planned loss, not the amount invested.</p></section>
    <section className="strategy-risk-section"><h4>Entry price</h4><div className="strategy-form-grid">
      <RhfSelect control={control} name="risk.entryOrderType" label="Buy order" placeholder="Market · next available price" options={[{ value: 'market', label: 'Market · next available price' }, { value: 'limit', label: 'Limit · my maximum buy price' }]} />
      {entryOrderType === 'limit' && <RhfInputNumber control={control} name="risk.entryLimitPrice" label="Maximum entry price (₹)" min={0.01} max={10000000} precision={2} />}
    </div><p className="muted">After the buy rules match, {entryOrderType === 'limit' ? 'wait for this price or lower until ' + (overnight ? '15:30' : '15:15') + ' IST in the eligible session. Manual buys also respect the limit, with a 60-second expiry.' : 'fill at the next eligible price. The example calculator below does not set the buy price.'}</p></section>
    <FixedPriceNotice risk={risk} />
    <section className="strategy-risk-section" aria-label="Initial stop-loss"><h4>Initial stop-loss</h4><p className="muted">Protection starts when your buy fills, even if no profit target is reached. Entry minus this initial stop defines 1R.</p><div className="strategy-form-grid">
      <Controller control={control} name="risk.stopMode" render={({ field, fieldState }) => <Form.Item label="Initial stop method" htmlFor={field.name} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
        <Select {...field} id={field.name} value={field.value === 'trailing' ? 'fixed' : field.value} disabled={mode === 'trailing'} onChange={value => { field.onChange(value); if (value === 'amount' || value === 'price') setValue('risk.stopValue', null, { shouldDirty: true }); }} options={[{ value: 'candleLow', label: 'Completed signal candle low' }, { value: 'ATR', label: 'ATR-based' }, { value: 'fixed', label: 'Fixed percentage' }, { value: 'amount', label: 'Rupee distance from entry' }, { value: 'price', label: 'Exact stop price' }]} />
      </Form.Item>} />
      {mode === 'ATR' ? <>
        <RhfInputNumber control={control} name="risk.atrPeriod" label="ATR period (candles)" min={2} max={100} precision={0} />
        <RhfInputNumber control={control} name="risk.atrMultiplier" label="ATR multiplier" min={0.5} max={10} step={0.5} />
      </> : mode === 'amount' || mode === 'price' ? <RhfInputNumber control={control} name="risk.stopValue" label={mode === 'price' ? 'Initial stop price (₹)' : 'Initial stop distance (₹ / share)'} min={0.01} max={10000000} precision={2} /> : mode !== 'candleLow' && <RhfInputNumber control={control} name="risk.stopPercent" label="Stop distance (%)" min={0.1} max={25} step={0.1} />}
      <RhfSelect control={control} name="risk.timeframe" label={mode === 'candleLow' ? 'Signal candle timeframe' : 'Risk calculation timeframe'} options={timeframeOptions} />
      <RhfInputNumber control={control} name="risk.maxStopPercent" label="Maximum initial stop distance (%) · optional" min={0.1} max={25} precision={2} step={0.1} />
    </div>
      <p className="risk-inline-explanation">{risk.maxStopPercent != null ? `Skip a buy if the initial stop is more than ${risk.maxStopPercent}% below its actual fill price, including entry slippage. Keep the chosen stop level; do not tighten it just to fit the limit.` : 'Leave the maximum distance blank for no additional entry filter.'} This limits the starting stop distance, not guaranteed loss during a price gap.</p>
      {mode === 'candleLow' && <p className="risk-inline-explanation">Uses the low of the latest completed {frameLabel} candle when the buy signal is confirmed. This low is frozen before entry. If the fill is at or below it, the buy is rejected. Manual buys use the latest completed candle when the order is submitted.</p>}
      {mode === 'ATR' && <p className="risk-inline-explanation">Uses {risk.atrPeriod} completed {frameLabel} candles. Initial stop distance = ATR × {risk.atrMultiplier}. ATR sets the starting distance; moving the stop later is optional below.</p>}
      {mode === 'trailing' && <p className="risk-inline-explanation">Trailing from entry uses this percentage distance. To choose a different initial method, turn off trailing or choose delayed trailing in “Move or trail the stop-loss” below.</p>}
      <Tag>{overnight ? 'Overnight holding allowed' : 'Intraday: square off at 15:15 IST'}</Tag><span className="muted">Set by the trading horizon in Setup.</span>
    </section>
    <ProfitTargetFields />
    <StopManagementFields />
    <RiskExampleCalculator />
    <Collapse ghost className="strategy-risk-section" items={[{ key: 'costs', label: 'Estimated trading costs', children: <div className="strategy-form-grid">
      <RhfInputNumber control={control} name="risk.slippagePercent" label="Slippage per side (%)" min={0} max={2} step={0.01} />
      <RhfInputNumber control={control} name="risk.feePercent" label="Estimated fees per side (%)" min={0} max={2} step={0.01} />
    </div> }]} /><p className="strategy-footnote">Sell rules, the active stop or session close can exit all remaining shares before a target is reached. Protective exits run automatically in both paper execution modes.</p>
  </div></RiskExampleContext.Provider>;
}
