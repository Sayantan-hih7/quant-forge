import type { StrategyRisk } from '../schemas/tradingPlanSchema';
import { targetLabel } from '../utils/targetValues';

export function ProfitTargetSummary({ risk }: { risk: StrategyRisk }) {
  if (!risk.exitTargets?.length) return <span>{risk.targetR}R · close all shares</span>;
  return <div className="strategy-target-summary">{risk.exitTargets.map((target, index, targets) => <div key={index}>
    <strong>T{index + 1} {targetLabel(target)}</strong> → {index === targets.length - 1 ? `remaining ${target.closePercent}%` : `sell ${target.closePercent}%`}
    {target.moveStopTo != null && <small>After fill: SL to {target.moveStopTo === 0 ? 'entry' : `Target ${target.moveStopTo}`}, or keep a higher stop.</small>}
  </div>)}{risk.breakevenAfterTarget1 && <small>After T1 fills: stop moves to entry (before costs).</small>}</div>;
}
