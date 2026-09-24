import { describeCondition } from '../config/metrics';
import { initialTemplates } from '../config/templates';
import { ruleMatches, conditionMatches } from '../utils/evaluateRules';
import { mockMarket } from './mockMarket';
import type { MonthlyCache, QualificationWorkspace, RuleDefinition, RuleTemplate, SignalRun } from '../types';
import { initialMonthlyRule } from '../config/monthlyFields';
import { createMonthlySnapshot } from './mockMonthly';
import { previousMonth } from '../../strategies/utils/monthlyCycle';
import { normalizeStrategyPairs } from '../../strategies/utils/strategyPairs';

export function previewBaseRule(rule: RuleDefinition) { return mockMarket.filter((stock) => ruleMatches(stock, rule)); }
export function createMonthlyCache(rule: RuleTemplate, month: string, time: number): MonthlyCache {
  return { id: crypto.randomUUID(), month, createdAt: new Date(time).toISOString(), sourceCount: mockMarket.length, rule: structuredClone(rule), candidates: previewBaseRule(rule) };
}
// The tactical function accepts a cache object only. It never iterates mockMarket.
export function scanCachedCandidates(cache: MonthlyCache, rule: RuleTemplate, time: number): SignalRun {
  const signals = cache.candidates.filter((stock) => ruleMatches(stock, rule)).map((stock) => {
    const direction = rule.side === 'BUY' ? 1 : -1;
    const risk = rule.horizon === 'intraday' ? 0.012 : rule.horizon === 'swing' ? 0.04 : 0.08;
    const entry = stock.close;
    return {
      symbol: stock.symbol, name: stock.name, sector: stock.sector, index: stock.index, side: rule.side,
      price: entry, entry, stopLoss: Number((entry * (1 - direction * risk)).toFixed(2)),
      target: Number((entry * (1 + direction * risk * 2)).toFixed(2)),
      reason: rule.groups.flatMap((group) => group.conditions).filter((condition) => conditionMatches(stock, condition)).map(describeCondition).join(' · '),
    };
  });
  return { id: crypto.randomUUID(), cacheId: cache.id, month: cache.month, templateId: rule.id, revision: rule.revision, strategy: rule.name, horizon: rule.horizon, cadence: rule.cadence, scannedCount: cache.candidates.length, time: new Date(time).toISOString(), signals };
}
export function createQualificationWorkspace(month: string): QualificationWorkspace {
  const templates = structuredClone(initialTemplates);
  const time = Date.parse(`${month}-01T02:00:00+05:30`);
  const monthlyRule = structuredClone(initialMonthlyRule);
  const cache = createMonthlySnapshot(monthlyRule, month, previousMonth(month), time);
  return normalizeStrategyPairs({ monthlyRule, monthlyRuleSaved: false, cacheHistory: [], templates, activeBaseId: templates[0].id, selectedTacticalId: 'tactical-intraday', caches: { [month]: cache }, runs: [], scheduledPreview: false, jobs: [] });
}
