import { runnerScopeSchema } from '../validations/paper.validation.js';
import { StrategyModel } from '../../strategies/models/strategy.model.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import { instruments } from '../../market-data/repository.js';
import { engineClient, engineInstruments, type EvaluationResult } from '../../engine/services/engine.service.js';
import { invariant } from '../../../shared/errors.js';
import { strategyHistoryPlan } from '../../backtesting/services/history-plan.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { sessionTime } from './paper.service.js';

interface Decision { id: string; barEnd: string | null; entry: EvaluationResult; exit: EvaluationResult; atr: number | null }
/** Read-only inspection of BOTH rule sides. Never records a signal or creates an order. */
export async function previewStrategy(raw: unknown) {
  const input = runnerScopeSchema.parse(raw), ids = [...new Set(input.ids)];
  const [strategy, universe, feed, stocks] = await Promise.all([
    StrategyModel.findById(input.strategyId).lean(), MonthlyUniverseModel.findById(currentMonth()).lean(), feedStatus(), instruments.find({ _id: { $in: ids } }).lean(),
  ]);
  invariant(strategy, 'Select a saved strategy');
  invariant(input.expectedRevision === undefined || strategy.revision === input.expectedRevision, 'The strategy changed. Reload its saved rules before inspecting signals.');
  invariant(ids.every(id => universe?.members.some(m => m.instrumentId === id)), 'Only currently qualified stocks can be checked');
  const cutoff = new Date().toISOString(), today = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
  const plan = strategyHistoryPlan(strategy, today, today), results: Decision[] = [];
  for (let offset = 0; offset < ids.length; offset += 5) {
    const data = await engineInstruments(ids.slice(offset, offset + 5), cutoff, false, plan);
    results.push(...(await engineClient.post<{ results: Decision[] }>('/decisions', { strategy, cutoff, instruments: data })).data.results);
  }
  return { strategyId: strategy._id, revision: strategy.revision, checkedAt: cutoff, execution: 'read-only', marketOpen: sessionTime().open,
    feed: { state: feed.state, message: feed.message }, results: results.map(row => ({ ...row, symbol: stocks.find(s => s._id === row.id)?.symbol ?? row.id,
      freshQuote: feed.quotes.some(q => q.instrumentId === row.id && q.fresh) })) };
}
