import type { MonthlyCache, QualificationWorkspace } from '../../qualification/types';

import { stopDistance } from '../../backtesting/api/mockBacktest';
import type { StockOpportunity } from '../types/opportunities';
import type { MonitorWorkspace } from '../../signals/types/monitor';

export const formatPrice = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

// Display-only levels, calculated from synthetic prices. Never a market feed.
export function getStockOpportunities(workspace: QualificationWorkspace, cache?: MonthlyCache, monitoring?: MonitorWorkspace): StockOpportunity[] {
  if (!cache) return [];
  const candidates = new Set(cache.candidates.map((stock) => stock.symbol));
  if (!monitoring) return [];
  const seen = new Set<string>();
  const live: StockOpportunity[] = [];
  for (const event of [...monitoring.signals].sort((a, b) => b.time - a.time)) {
    const key = `${event.monitorId}:${event.symbol}`;
    const rule = workspace.templates.find(item => item.id === event.rule.id);
    if (seen.has(key) || event.side !== 'BUY' || event.disposition !== 'ready' || event.expiresAt < monitoring.clock || monitoring.feed !== 'healthy' || rule?.revision !== event.rule.revision || !candidates.has(event.symbol)) continue;
    seen.add(key);
    const stock = cache.candidates.find(item => item.symbol === event.symbol)!;
    const risk = workspace.tradingPlans?.find(plan => plan.entryRuleId === event.monitorId && !plan.needsReview)?.risk;
    if (!risk) continue;
    const distance = stopDistance(event.price, risk);
    const stopLoss = event.price - distance;
    const target = event.price + distance * risk.targetR;
    live.push({ id: event.id, symbol: event.symbol, name: stock.name, layerId: event.monitorId, strategy: event.strategy, horizon: event.rule.horizon, cacheId: cache.id, side: 'BUY', signalledAt: new Date(event.time).toISOString(), ltp: event.price, changePercent: 0, entry: event.price, stopLoss, target, upside: (target - event.price) / event.price * 100, rewardRisk: risk.targetR, risk: 'Medium' });
  }
  return live;
}
