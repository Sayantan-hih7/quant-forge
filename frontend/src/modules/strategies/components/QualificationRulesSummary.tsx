import type { QualificationRules } from '../types/workspace';
export function QualificationRulesSummary({ rules }: { rules: QualificationRules }) {
  return <div className="qualification-rules">
    <span>{rules.source}</span>
    <span>{rules.trend === 'above-ema50' ? 'Monthly close > 50 EMA' : rules.trend === 'above-ema200' ? 'Monthly close > 200 EMA' : 'Any price trend'}</span>
    <span>6M return ≥ {rules.minMomentum}%</span>
    <span>Avg. turnover ≥ ₹{rules.minTurnover} Cr</span>
  </div>;
}
