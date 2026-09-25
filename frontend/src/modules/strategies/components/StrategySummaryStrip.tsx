import { Tag } from 'antd';
import { horizonLabels } from '../../qualification/config/metrics';
import type { TradingPlanDraft } from '../types/tradingPlan';

import { cadenceLabel } from '../utils/strategyLabels';
export function StrategySummaryStrip({ strategy, revision }: { strategy: TradingPlanDraft; revision?: number }) {
  return <div className="strategy-summary-strip" aria-label="Selected strategy settings">
    <div><span>Strategy</span><strong>{strategy.name}</strong></div>
    <div><span>Check frequency</span><strong>{cadenceLabel(strategy.entry.cadence)}</strong></div>
    <div><span>Capital / risk per trade</span><strong>₹{strategy.risk.initialCapital.toLocaleString('en-IN')} / {strategy.risk.riskPercent}%</strong></div>
    <div><span>Holding period</span><strong>{horizonLabels[strategy.entry.horizon]}</strong></div>
    {revision !== undefined && <Tag>Saved revision {revision}</Tag>}
  </div>;
}
