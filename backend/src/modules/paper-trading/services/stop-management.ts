import type { Risk } from '../../strategies/validations/strategy.validation.js';
import type { PaperPosition } from '../models/paper.model.js';
import type { StopManagement } from '../../strategies/validations/stop-settings.js';

export function initialRiskDistance(risk: Risk, entryPaise: number, atr?: number, signalLow?: number) {
  if (risk.stopMode === 'candleLow') return signalLow && Number.isFinite(signalLow) ? entryPaise - Math.round(signalLow * 100) : 0;
  if (risk.stopMode === 'ATR') return Math.round((atr ?? 0) * risk.atrMultiplier * 100);
  if (risk.stopMode === 'amount') return Math.round((risk.stopValue ?? 0) * 100);
  if (risk.stopMode === 'price') return entryPaise - Math.round((risk.stopValue ?? 0) * 100);
  return Math.round(entryPaise * risk.stopPercent / 100);
}
export function stopPlan(risk: Risk): StopManagement | undefined {
  return risk.stopManagement ?? (risk.breakevenAfterTarget1 ? { breakeven: { trigger: 'target', at: 1 } } : undefined);
}
/** 1R never changes after entry. Peaks are tracked from trailing activation. */
export function advanceStop(position: PaperPosition, risk: Risk, pricePaise: number) {
  let stopPaise = position.exitControl?.strategyStopPaise ?? position.stopPaise, highWaterPaise = position.highWaterPaise;
  let breakevenActivated = position.breakevenActivated, trailingActivated = position.trailingActivated;
  const plan = stopPlan(risk), distance = position.initialRiskPaise;
  for (const [index, target] of (risk.exitTargets ?? []).entries()) {
    if (target.moveStopTo === undefined || !position.targets?.[index]?.filledQuantity) continue;
    const level = target.moveStopTo === 0 ? position.entryPaise : (position.exitControl?.strategyTargetPrices[target.moveStopTo - 1] ?? position.targets[target.moveStopTo - 1]?.pricePaise);
    if (level !== undefined) stopPaise = Math.max(stopPaise, level);
    if (target.moveStopTo === 0) breakevenActivated = true;
  }
  const reached = (rule: { trigger: 'risk' | 'target'; at: number }) => rule.trigger === 'risk'
    ? !!distance && pricePaise >= position.entryPaise + Math.round(distance * rule.at)
    : !!position.targets?.[rule.at - 1]?.filledQuantity;
  if (plan?.breakeven && (breakevenActivated || reached(plan.breakeven))) {
    breakevenActivated = true; stopPaise = Math.max(stopPaise, position.entryPaise);
  }
  if (plan?.trailing && distance && (trailingActivated || reached(plan.trailing))) {
    highWaterPaise = trailingActivated ? Math.max(highWaterPaise ?? pricePaise, pricePaise) : pricePaise;
    trailingActivated = true;
    stopPaise = Math.max(stopPaise, highWaterPaise - Math.max(1, Math.round(distance * plan.trailing.distanceR)));
  } else if (risk.stopMode === 'trailing') {
    trailingActivated = true; highWaterPaise = Math.max(highWaterPaise ?? pricePaise, pricePaise);
    stopPaise = Math.max(stopPaise, Math.round(pricePaise * (1 - risk.stopPercent / 100)));
  }
  return { stopPaise:position.exitControl?.stopOverridden?position.stopPaise:stopPaise, highWaterPaise, breakevenActivated, trailingActivated, ...(position.exitControl?{exitControl:{...position.exitControl,strategyStopPaise:stopPaise}}:{}) };
}
export function exceedsStopLimit(risk: Pick<Risk, 'maxStopPercent'>, entryPaise: number, distancePaise: number) {
  return risk.maxStopPercent !== undefined && distancePaise * 100 - entryPaise * risk.maxStopPercent > 1e-7;
}

export function stopLimitMessage(risk: Pick<Risk, 'maxStopPercent'>, entryPaise: number, distancePaise: number) {
  return `Buy skipped: signal/initial stop is ${(distancePaise / entryPaise * 100).toFixed(2)}% below the entry, exceeding the ${risk.maxStopPercent}% maximum. The stop was not moved.`;
}
