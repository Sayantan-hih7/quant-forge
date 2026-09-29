import type { StrategyRisk } from '../schemas/tradingPlanSchema';
import { targetMoney } from './targetValues';

export function stopPlan(risk: StrategyRisk) {
  return risk.stopManagement ?? (risk.breakevenAfterTarget1 ? { breakeven: { trigger: 'target' as const, at: 1 } } : undefined);
}
export function initialStopLabel(risk: StrategyRisk) {
  return risk.stopMode === 'candleLow' ? `Completed ${risk.timeframe} signal candle low`
    : risk.stopMode === 'ATR' ? `ATR(${risk.atrPeriod}) × ${risk.atrMultiplier}`
    : risk.stopMode === 'price' ? `At ${targetMoney(risk.stopValue ?? 0)}`
    : risk.stopMode === 'amount' ? `${targetMoney(risk.stopValue ?? 0)} below entry` : `${risk.stopPercent}% below entry`;
}
export function referenceRisk(risk: StrategyRisk, entry: number | null, atrStop: number | null, signalLow: number | null = null) {
  if (!entry || !Number.isFinite(entry)) return null;
  const entryPaise = Math.round(entry * 100);
  // Match execution: round the distance, rather than rounding the stop first.
  const distance = risk.stopMode === 'candleLow' ? signalLow == null || signalLow <= 0 ? NaN : entryPaise - Math.round(signalLow * 100)
    : risk.stopMode === 'ATR' ? atrStop == null ? NaN : Math.round((entry - atrStop) * 100)
    : risk.stopMode === 'price' ? risk.stopValue == null ? NaN : entryPaise - Math.round(risk.stopValue * 100)
    : risk.stopMode === 'amount' ? Math.round((risk.stopValue ?? 0) * 100) : Math.round(entryPaise * risk.stopPercent / 100);
  return Number.isFinite(distance) && distance > 0 && distance < entryPaise ? distance / 100 : null;
}
export const stopTriggerLabel = (rule: { trigger: 'risk' | 'target'; at: number }) =>
  rule.trigger === 'risk' ? `at +${rule.at}R` : `after Target ${rule.at} fills`;
