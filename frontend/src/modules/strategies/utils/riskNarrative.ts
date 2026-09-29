import type { StrategyRisk } from '../schemas/tradingPlanSchema';
import { initialStopLabel, stopPlan, stopTriggerLabel } from './stopSettings';
import { targetLabel, targetMoney } from './targetValues';
const money = (value: number | null | undefined) => value != null && Number.isFinite(value) ? targetMoney(value) : 'not set';

export function riskNarrative(risk: StrategyRisk) {
  const adjustments = stopPlan(risk);
  const moves = [
    ...(risk.exitTargets ?? []).flatMap((target,i) => target.moveStopTo == null ? [] : [`After Target ${i+1} fills, move the stop to ${target.moveStopTo === 0 ? 'entry' : `Target ${target.moveStopTo}`} (or keep a higher stop).`]),
    risk.stopMode === 'trailing' && `Trail from entry at ${risk.stopPercent}% below the highest price.`,
    adjustments?.breakeven && `Move the stop to entry ${stopTriggerLabel(adjustments.breakeven)}.`,
    adjustments?.trailing && `Trail ${adjustments.trailing.distanceR} times the original risk behind the highest price ${stopTriggerLabel(adjustments.trailing)}.`,
  ].filter(Boolean).join(' ');
  return [
    { key: 'size', title: 'How much can I lose?', text: `${risk.riskPercent ?? 'Not set'}% of account equity per trade; initially ${money(risk.initialCapital * risk.riskPercent / 100)} on ${money(risk.initialCapital)} capital. Up to ${risk.maxPositions ?? 'not set'} open positions. This is planned loss, not money invested or a guaranteed loss limit.` },
    { key: 'entry', title: 'When will I buy?', text: risk.entryOrderType === 'limit' ? `After the buy rules match, wait for the maximum price (${money(risk.entryLimitPrice)}) or lower. An unfilled limit expires at ${risk.overnight ? '15:30' : '15:15'} IST in the eligible session.` : 'After the buy rules match, use the next eligible market price.' },
    { key: 'stop', title: 'What protects me immediately?', text: risk.stopMode === 'ATR' ? `Initial stop distance: ${risk.atrPeriod}-candle ATR × ${risk.atrMultiplier}, using completed ${risk.timeframe} candles. ATR measures typical price movement; the price is calculated when a trade enters.` : `Initial stop: ${initialStopLabel(risk)}. The distance from the filled buy price to this stop becomes 1R.` },
    { key: 'targets', title: 'When do I take money out?', text: risk.exitTargets?.length ? risk.exitTargets.map((target, i) => `Target ${i + 1}: ${targetLabel(target)}, ${i === risk.exitTargets!.length - 1 ? 'close the remaining' : 'sell'} ${target.closePercent}% of the original position.`).join(' ') : `Close the whole position at ${risk.targetR} times the initial risk (R) above entry.` },
    { key: 'moves', title: 'How does my stop move later?', text: moves ? `${moves} These adjustments raise the same stop; they do not sell shares. 1R stays fixed.` : 'No automatic stop adjustments. Keep the initial stop until the position exits.' },
    { key: 'timing', title: 'Can I hold overnight?', text: `${risk.overnight ? 'Yes, overnight holding is allowed.' : 'No, remaining shares are squared off at 15:15 IST.'} Risk calculation timeframe: ${risk.timeframe}.` },
    { key: 'costs', title: 'What costs are assumed?', text: `${risk.slippagePercent}% slippage and ${risk.feePercent}% estimated fees per side.` },
  ];
}
