import mongoose from 'mongoose';
import { invariant } from '../../../shared/errors.js';
import { validateSourcedRule } from '../../market-data/services/capabilities.service.js';
import { StrategyModel, StrategyRevisionModel } from '../models/strategy.model.js';
import type { StrategyDraft } from '../validations/strategy.validation.js';
export async function saveStrategy(id: string, draft: StrategyDraft, expectedRevision: number) {
  invariant(draft.entry.side === 'BUY' && draft.exit.side === 'SELL', 'Save a buy entry and a sell exit together');
  invariant(draft.entry.tier === 'tactical' && draft.exit.tier === 'tactical', 'Trading rules must be tactical rules');
  invariant(draft.entry.cadence === draft.exit.cadence && ['1m', '5m', '15m', 'daily'].includes(String(draft.entry.cadence)), 'Both sides must use the same candle-close cadence');
  invariant(draft.entry.horizon === draft.exit.horizon, 'Both sides must use the same trading horizon');
  invariant(draft.entry.horizon !== 'intraday' || !draft.risk.overnight, 'Intraday strategies must close before the session ends');
  await Promise.all([validateSourcedRule(draft.entry), validateSourcedRule(draft.exit)]);
  const record = { ...draft, _id: id, revision: expectedRevision + 1, savedAt: new Date().toISOString() };
  await mongoose.connection.transaction(async session => {
    if (!expectedRevision) {
      invariant(!await StrategyModel.exists({ _id: id }).session(session), 'Strategy already exists. Reload before saving');
      await StrategyModel.create([record], { session });
    } else {
      const result = await StrategyModel.updateOne({ _id: id, revision: expectedRevision }, { $set: record }, { session });
      invariant(result.modifiedCount, 'This strategy changed elsewhere. Reload before saving');
    }
    await StrategyRevisionModel.create([{ ...record, _id: `${id}:${record.revision}` }], { session });
  });
  return record;
}
