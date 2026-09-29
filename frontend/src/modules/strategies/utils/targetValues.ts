import { targetBasis, targetValue, type ExitTarget, type TargetBasis } from '../schemas/exitTargetsSchema';

export const targetMoney = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function targetIllustration(target: ExitTarget, entry: number | null, initialRisk?: number | null) {
  const value = targetValue(target);
  if (!entry || entry <= 0 || value == null || !Number.isFinite(value)) return null;
  const basis = targetBasis(target), entryPaise = Math.round(entry * 100);
  if (basis === 'risk' && (!initialRisk || initialRisk <= 0)) return null;
  const pricePaise = basis === 'percent' ? Math.round(entryPaise * (1 + value / 100))
    : basis === 'risk' ? entryPaise + Math.round(initialRisk! * 100 * value)
    : basis === 'amount' ? entryPaise + Math.round(value * 100) : Math.round(value * 100);
  return { price: pricePaise / 100, gain: (pricePaise - entryPaise) / 100, percent: (pricePaise - entryPaise) / entryPaise * 100 };
}

/** Convert only with an explicit reference; never silently reinterpret a percentage as a price. */
export function convertTarget(target: ExitTarget, basis: TargetBasis, entry: number | null, initialRisk?: number | null): ExitTarget {
  const example = targetIllustration(target, entry, initialRisk);
  const convertible = example && (basis !== 'risk' || (initialRisk && initialRisk > 0));
  const value = convertible ? Math.round((basis === 'percent' ? example.percent : basis === 'risk' ? example.gain / initialRisk! : basis === 'amount' ? example.gain : example.price) * 100) / 100 : null;
  return { basis, closePercent: target.closePercent, ...(target.moveStopTo !== undefined ? { moveStopTo: target.moveStopTo } : {}), ...(basis === 'percent' ? { profitPercent: value } : { value }) };
}

export function targetLabel(target: ExitTarget) {
  const value = targetValue(target);
  if (value == null) return 'Enter target';
  const basis = targetBasis(target);
  return basis === 'risk' ? `${value}R` : basis === 'percent' ? `+${value}%` : basis === 'amount' ? `+${targetMoney(value)} / share` : `at ${targetMoney(value)}`;
}
