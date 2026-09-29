import type { Risk } from '../../strategies/validations/strategy.validation.js';
import type { PaperPosition, PaperTarget } from '../models/paper.model.js';
import { targetBasis } from '../../strategies/validations/exit-targets.js';

export class InvalidTargetPriceError extends Error {
  constructor() { super('Profit targets must be above the filled entry price and at least ₹0.01 apart. Review your target values.'); }
}

/** Whole shares, allocated from original size. Rounding residue goes to later targets. */
export function positionTargets(risk: Risk, entryPaise: number, quantity: number, initialRiskPaise?: number): PaperTarget[] | undefined {
  if (!risk.exitTargets?.length) return undefined;
  let percent = 0, allocated = 0, previousPrice = entryPaise;
  return risk.exitTargets.map((target, index, targets) => {
    const basis = targetBasis(target);
    const pricePaise = basis === 'percent' ? Math.round(entryPaise * (1 + target.profitPercent! / 100))
      : basis === 'risk' ? entryPaise + Math.round((initialRiskPaise ?? NaN) * target.value!)
      : basis === 'amount' ? entryPaise + Math.round(target.value! * 100) : Math.round(target.value! * 100);
    if (!Number.isFinite(pricePaise) || pricePaise <= previousPrice) throw new InvalidTargetPriceError();
    previousPrice = pricePaise;
    percent += target.closePercent;
    const cumulative = index === targets.length - 1 ? quantity : Math.floor(quantity * percent / 100 + 1e-9);
    const shares = cumulative - allocated;
    allocated = cumulative;
    return { pricePaise, quantity: shares, completed: shares === 0 };
  });
}

export function nextTarget(position: PaperPosition) {
  return position.targets?.findIndex(target => !target.completed) ?? -1;
}
