import { Alert, Button, Form, InputNumber, Tag } from 'antd';
import { useFormContext, useWatch } from 'react-hook-form';
import type { TradingPlanDraft } from '../types/tradingPlan';
import { useRiskExample } from '../hooks/useRiskExample';
import { referenceRisk, stopPlan } from '../utils/stopSettings';
import { targetIllustration, targetLabel, targetMoney } from '../utils/targetValues';
import type { StrategyRisk } from '../schemas/tradingPlanSchema';

export function RiskExampleCalculator() {
  const { control } = useFormContext<TradingPlanDraft>();
  const risk = useWatch({ control, name: 'risk' });
  const { entry, atr, signalLow, setSignalLow, setEntry, setAtr } = useRiskExample();
  return <section className="risk-example" aria-label="Example calculator">
    <header><div><h4>Example calculator</h4><p>See how the plan fits together. These inputs only change this illustration and target-unit conversions.</p></div><Tag>Preview only · not an order</Tag></header>
    <div className="strategy-form-grid">
      <Form.Item label="Reference entry price (₹)" htmlFor="target-reference-entry"><InputNumber id="target-reference-entry" min={0.01} max={10000000} precision={2} value={entry} onChange={setEntry} placeholder="Enter an example filled price" style={{ width: '100%' }} /></Form.Item>
      {risk.stopMode === 'candleLow' && <Form.Item label="Example signal candle low (₹)" htmlFor="risk-example-low"><InputNumber id="risk-example-low" value={signalLow} onChange={setSignalLow} min={0.01} precision={2} placeholder="Illustration only" style={{ width: '100%' }} /></Form.Item>}
      {risk.stopMode === 'ATR' && <Form.Item label="Example ATR (₹)" htmlFor="risk-example-atr"><InputNumber id="risk-example-atr" value={atr} onChange={setAtr} min={0.01} precision={2} placeholder="For illustration, not fetched market data" style={{ width: '100%' }} /></Form.Item>}
      {risk.entryOrderType === 'limit' && !!risk.entryLimitPrice && <Button onClick={() => setEntry(risk.entryLimitPrice!)}>Use limit price as example</Button>}
    </div>
    {entry && risk.entryOrderType === 'limit' && risk.entryLimitPrice && entry > risk.entryLimitPrice ? <Alert showIcon type="warning" title="This example entry exceeds your buy limit" description="The calculation below is hypothetical. An actual buy would wait for your limit price or lower." /> : null}
    <RiskExampleOutcome risk={risk} entry={entry} atr={atr} signalLow={signalLow} />
  </section>;
}

export function RiskExampleOutcome({ risk, entry, atr, signalLow = null }: { signalLow?: number | null; risk: StrategyRisk; entry: number | null; atr: number | null }) {
  const distance = referenceRisk(risk, entry, entry && atr ? entry - atr * risk.atrMultiplier : null, signalLow);
  const budget = risk.initialCapital * risk.riskPercent / 100;
  const quantity = entry && distance ? Math.max(0, Math.min(Math.floor(budget / distance), Math.floor(risk.initialCapital / (entry * (1 + risk.feePercent / 100))))) : null;
  const targets = risk.exitTargets?.length ? risk.exitTargets : [{ basis: 'risk' as const, value: risk.targetR, closePercent: 100 }];
  const plan = stopPlan(risk);
  const when = (rule: { trigger: 'risk' | 'target'; at: number }) => rule.trigger === 'target' ? `After Target ${rule.at} fills` : `At ${entry && distance ? targetMoney(entry + distance * rule.at) : `+${rule.at}R`}`;
  if (entry && distance && risk.maxStopPercent != null && Math.round(distance * 100) * 100 - Math.round(entry * 100) * risk.maxStopPercent > 1e-7) return <Alert type="warning" showIcon title="This entry would be skipped" description={`The initial stop at ${targetMoney(entry - distance)} is ${(distance / entry * 100).toFixed(2)}% below ${targetMoney(entry)}, exceeding your ${risk.maxStopPercent}% limit. No shares would be bought. The candle/initial stop is kept unchanged.`}/>;
  return <>{entry && distance ? <>
      <div className="risk-example-flow" data-testid="initial-risk-preview"><span>Entry <strong>{targetMoney(entry)}</strong></span><span>Initial SL <strong>{targetMoney(entry - distance)}</strong></span><span><strong>1R {targetMoney(distance)}</strong><small>Stays fixed after the stop moves</small></span></div>
      <p>Starting risk budget <strong>{targetMoney(budget)}</strong> → up to <strong>{quantity} whole shares</strong> with otherwise unused starting capital. Actual sizing uses the account balance at entry.</p>
      <div className="risk-example-targets">{targets.map((target, index) => {
        const before = targets.slice(0, index).reduce((sum, item) => sum + item.closePercent, 0);
        const cumulative = before + target.closePercent;
        const shares = quantity == null ? null : index === targets.length - 1 ? quantity - Math.floor(quantity * before / 100 + 1e-9) : Math.floor(quantity * cumulative / 100 + 1e-9) - Math.floor(quantity * before / 100 + 1e-9);
        const illustration = targetIllustration(target, entry, distance);
        return <div key={index}><small>Target {index + 1} · {targetLabel(target)}</small><strong>{illustration && illustration.gain > 0 ? targetMoney(illustration.price) : 'Enter a valid target'}</strong><span>{index === targets.length - 1 ? 'Close remaining' : 'Sell'} {target.closePercent}%{shares != null && shares >= 0 ? ` · ${shares} shares` : ''}</span></div>;
      })}</div>
      {risk.exitTargets?.map((target, i) => target.moveStopTo != null && <p key={i}>After Target {i + 1} fills, move the stop to <strong>{target.moveStopTo === 0 ? targetMoney(entry) : (targetIllustration(risk.exitTargets![target.moveStopTo - 1], entry, distance)?.price ? targetMoney(targetIllustration(risk.exitTargets![target.moveStopTo - 1], entry, distance)!.price) : `Target ${target.moveStopTo} price`)}</strong> if it is not already higher.</p>)}
      {plan?.breakeven && <p>{when(plan.breakeven)}, move the stop to <strong>{targetMoney(entry)}</strong> if it is not already higher. No shares are sold by this adjustment.</p>}
      {plan?.trailing && <p>{when(plan.trailing)}, start trailing the remaining shares <strong>{targetMoney(distance * plan.trailing.distanceR)} ({plan.trailing.distanceR}R)</strong> behind the highest price observed after activation.</p>}
      {risk.stopMode === 'trailing' && <p>Trail from entry at {risk.stopPercent}% below the highest observed price. The stop only moves up.</p>}
      {!!plan && <small>Target-based adjustments require an actual exit fill; a zero-share target does not activate them.</small>}
    </> : <p className="muted">{!entry ? 'Enter an example entry price to see the initial stop, targets and stop movements together.' : risk.stopMode === 'candleLow' && !signalLow ? 'Enter an example signal candle low to calculate the starting stop and 1R.' : risk.stopMode === 'ATR' && !atr ? 'Enter an example ATR to calculate the starting stop and 1R.' : 'The example initial stop must be positive and below the example entry.'}</p>}
    <small>Actual fills may differ. Entry-price breakeven excludes fees. This illustration is not a backtest or a guarantee of execution price.</small>
  </>;
}
