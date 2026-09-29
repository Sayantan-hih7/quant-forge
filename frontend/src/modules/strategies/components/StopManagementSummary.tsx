import type { StrategyRisk } from '../schemas/tradingPlanSchema';
import { initialStopLabel, stopPlan, stopTriggerLabel } from '../utils/stopSettings';

export function StopManagementSummary({ risk }: { risk: StrategyRisk }) {
  const plan = stopPlan(risk);
  return <div className="strategy-target-summary"><span>Initial SL: {initialStopLabel(risk)}</span>
    {risk.stopMode === 'trailing' && <small>Trail from entry at {risk.stopPercent}% below the highest price.</small>}
    {plan?.breakeven && <small>Move SL to entry {stopTriggerLabel(plan.breakeven)}.</small>}
    {plan?.trailing && <small>Trail by {plan.trailing.distanceR}R {stopTriggerLabel(plan.trailing)}.</small>}
  </div>;
}
