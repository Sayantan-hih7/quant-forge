import type { TradePlan } from '../models/paper.model.js';
import type { Protection } from '../validations/manual.validation.js';

/** Manual-trade protection expressed in the same plan the paper engine already manages for strategies. */
export function manualPlan(protection: Protection, product: 'delivery' | 'intraday', capitalRupees: number): TradePlan {
  const { stop, targets, breakeven, trailing } = protection;
  const overnight = product === 'delivery';
  const plan: TradePlan = {
    initialCapital: capitalRupees, riskPercent: 1, maxPositions: 50, timeframe: '1d', overnight,
    stopMode: stop.mode === 'price' ? 'price' : stop.mode === 'atr' ? 'ATR' : stop.mode === 'trailing' ? 'trailing' : 'fixed',
    stopPercent: stop.mode === 'percent' || stop.mode === 'trailing' ? stop.value : 2,
    ...(stop.mode === 'price' ? { stopValue: stop.value } : {}),
    atrPeriod: 14, atrMultiplier: stop.mode === 'atr' ? stop.value : 2, targetR: 10,
    // Approximate Indian equity costs: delivery carries STT on both sides; intraday is cheaper.
    feePercent: overnight ? 0.12 : 0.05, slippagePercent: 0.05,
  };
  if (targets.length) plan.exitTargets = targets.map(t => t.basis === 'percent'
    ? { basis: 'percent', profitPercent: t.value, closePercent: t.sellPercent } : { basis: 'price', value: t.value, closePercent: t.sellPercent });
  else plan.noTarget = true;
  const management: NonNullable<TradePlan['stopManagement']> = {};
  if (breakeven === 'target1') management.breakeven = { trigger: 'target', at: 1 };
  if (breakeven === 'profit1R') management.breakeven = { trigger: 'risk', at: 1 };
  if (trailing === 'afterTarget1') management.trailing = { trigger: 'target', at: 1, distanceR: 1 };
  if (trailing === 'after1R') management.trailing = { trigger: 'risk', at: 1, distanceR: 1 };
  if (management.breakeven || management.trailing) plan.stopManagement = management;
  return plan;
}

