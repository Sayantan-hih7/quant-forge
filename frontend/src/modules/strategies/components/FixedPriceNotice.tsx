import { Alert } from 'antd';
import type { StrategyRisk } from '../schemas/tradingPlanSchema';
import { targetMoney } from '../utils/targetValues';

export function FixedPriceNotice({ risk, selectedCount }: { risk: StrategyRisk; selectedCount?: number }) {
  const settings = [
    risk.entryOrderType === 'limit' && `Buy limit ${risk.entryLimitPrice ? targetMoney(risk.entryLimitPrice) : '(enter price)'}`,
    risk.stopMode === 'price' && `Initial SL ${risk.stopValue ? targetMoney(risk.stopValue) : '(enter price)'}`,
    risk.exitTargets?.some(t => t.basis === 'price') && 'Exact target prices',
  ].filter(Boolean);
  if (!settings.length) return null;
  const multiple = selectedCount !== undefined && selectedCount > 1;
  return <Alert className="risk-price-notice" showIcon type={multiple ? 'warning' : 'info'}
    title={multiple ? `The same fixed prices will apply to all ${selectedCount} selected stocks` : 'Fixed prices apply to every stock selected for this strategy'}
    description={`${settings.join(' · ')}. These are absolute prices, not values calculated separately for each stock. Review your stock selection before running.`} />;
}
