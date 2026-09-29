import { Tag } from 'antd';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { summarizeCondition } from '../../qualification/utils/ruleSummary';
import type { ReplayStep } from '../utils/replayTimeline';
import { reportMoney, reportTime } from '../utils/reportFormat';

const value = (n?: number) => n == null || !Number.isFinite(n) ? 'Unavailable' : n.toLocaleString('en-IN', { maximumFractionDigits: 4 });
export function ReplayExplanation({ step, strategy, hasPosition, limited = false }: { step: ReplayStep; strategy: SavedStrategy; hasPosition: boolean; limited?: boolean }) {
  const e = step.event;
  const rule = e?.side === 'SELL' ? strategy.exit : strategy.entry;
  const conditions = rule.groups.flatMap(g => g.conditions);
  const groups = rule.groups.flatMap((g,i) => g.conditions.map(() => `Group ${i + 1} · ${g.logic}`));
  let title = step.phase === 'open' ? 'Candle opens' : 'Candle completes';
  let description = step.phase === 'open'
    ? 'Only the opening price is known. This candle’s high, low, close and volume have not been revealed yet.'
    : hasPosition ? 'The full candle is now visible. Its final shape does not change the earlier entry decision. Recorded target and stop events appear in the next steps.'
      : 'The full candle is now visible. Any recorded signal follows in the next step.';
  if (e?.kind === 'signal') {
    title = `${e.side} rule matched`;
    description = `The engine checked the saved rule using completed candles. A signal is a decision, not a fill. ${e.side === 'SELL' ? 'The following exit step shows the actual simulated fill.' : 'Entry still depends on the order type, price, capital and risk limits.'}`;
  } else if (e?.kind === 'entry') {
    title = `Bought ${e.quantity} shares at ${reportMoney(e.price!)}`;
    description = e.phase === 'open' ? 'The earlier signal is filled at this candle’s open, with the configured slippage. The rest of this candle has not happened yet.'
      : 'The limit price was reached inside this candle. The historical data cannot tell us the exact tick when it filled; this step reveals the recorded fill after the candle completes.';
  } else if (e?.kind === 'exit') {
    title = `${e.reason ?? 'Exit'} · sold ${e.quantity} shares at ${reportMoney(e.price!)}`;
    description = e.phase === 'open' ? 'This exit was filled at the candle open after the preceding decision.'
      : 'This fill was simulated within the candle. OHLC data does not give its exact tick time. If both stop and target were touched, the engine checks the stop first.';
  } else if (e?.kind === 'stop') {
    title = `Stop moves from ${reportMoney(e.previousStop!)} to ${reportMoney(e.stop!)}`;
    description = `${e.reason}. This higher stop protects the remaining shares from the next candle onward; it is not applied retroactively to this candle’s low.`;
  }
  if (limited && (e?.kind === 'entry' || e?.kind === 'exit')) description = 'This is a fill saved in the original report. Its original signal and exact within-candle sequence could not be verified, so playback does not claim how the decision was made.';
  return <section className="bt-replay-explanation" aria-label="Why this happened" aria-live="polite">
    <span className="bt-replay-eyebrow">WHY THIS HAPPENED</span>
    <h4>{title}</h4><p>{description}</p>
    {e?.kind === 'signal' && <>
      {e.candle && <p className="muted">Signal candle · {reportTime(e.candle.time)} · O {value(e.candle.open)} / H {value(e.candle.high)} / L {value(e.candle.low)} / C {value(e.candle.close)} · {e.candle.close > e.candle.open ? 'Green' : e.candle.close < e.candle.open ? 'Red' : 'Doji'}</p>}
      <p className="muted">Between groups: {rule.logic}. Each group keeps its saved AND / OR logic.</p>
      <ol className="bt-replay-checks">{(e.checks ?? []).map((check,i) => <li key={i}>
        <div><Tag color={check.matched === true ? 'green' : check.matched === false ? 'red' : 'orange'}>{check.matched === true ? 'Met' : check.matched === false ? 'Not met' : 'Unavailable'}</Tag>
          {conditions[i] ? summarizeCondition(conditions[i]) : check.field}</div>
        <span>{groups[i]} · Observed: <b>{value(check.left)}</b>{check.right != null && <> · Compared with: <b>{value(check.right)}</b></>}{check.reason && ` · ${check.reason}`}</span>
      </li>)}</ol>
      {(e.checks ?? []).some(c => c.field === 'bodyAboveEma' || c.field === 'bodyBelowEma') && <p className="muted">Body percentage measures the open-to-close body, excluding wicks. Green / red is a separate condition.</p>}
    </>}
  </section>;
}
