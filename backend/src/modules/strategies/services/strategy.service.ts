import { PaperSessionModel, PaperPositionModel, PaperOrderModel } from '../../paper-trading/models/paper.model.js';
import mongoose from 'mongoose';
import { invariant } from '../../../shared/errors.js';
import { validateSourcedRule } from '../../market-data/services/capabilities.service.js';
import { StrategyModel, StrategyRevisionModel, StrategySlotModel } from '../models/strategy.model.js';
import type { StrategyDraft } from '../validations/strategy.validation.js';
import { reviewStrategy } from './rule-review.service.js';
export async function saveStrategy(id: string, draft: StrategyDraft, expectedRevision: number) {
  if(!expectedRevision)draft={...draft,risk:{...draft.risk,costModel:draft.risk.costModel??'indian-cash',dailyLossLimitPercent:draft.risk.dailyLossLimitPercent??2,maxEntryDeviationPercent:draft.risk.maxEntryDeviationPercent??2,...(!draft.risk.overnight?{entryCutoffMinute:draft.risk.entryCutoffMinute??900}:{})}};
  invariant(['intraday','swing','long-term'].includes(String(draft.entry.horizon)),'Choose Intraday, Swing or Long-term.');
  invariant(draft.entry.side === 'BUY' && draft.exit.side === 'SELL', 'Save a buy entry and a sell exit together');
  invariant(draft.entry.enabled !== false, 'Buy conditions cannot be disabled');
  invariant(draft.entry.tier === 'tactical' && draft.exit.tier === 'tactical', 'Trading rules must be tactical rules');
  invariant(draft.entry.cadence === draft.exit.cadence && ['1m', '5m', '15m', 'daily'].includes(String(draft.entry.cadence)), 'Both sides must use the same candle-close cadence');
  invariant(draft.entry.horizon === draft.exit.horizon, 'Both sides must use the same trading horizon');
  invariant(draft.entry.horizon !== 'intraday' || !draft.risk.overnight, 'Intraday strategies must close before the session ends');
  await Promise.all([validateSourcedRule(draft.entry), validateSourcedRule(draft.exit)]);
  const review = reviewStrategy(draft);
  invariant(!review.blocked, review.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.title}. ${issue.recommendation}`).join(' '));
  // Mixed fields must serialize identically for updates and revision inserts.
  const persistedDraft=JSON.parse(JSON.stringify(draft)) as StrategyDraft;
  const record = { ...persistedDraft, _id: id, revision: expectedRevision + 1, savedAt: new Date().toISOString() };
  await mongoose.connection.transaction(async session => {
    await StrategySlotModel.updateOne({_id:String(draft.entry.horizon)},{$inc:{serial:1}},{upsert:true,session});
    invariant(!await StrategyModel.exists({_id:{$ne:id},'entry.horizon':draft.entry.horizon,archivedAt:{$exists:false}}).session(session),'A current strategy already exists for this holding period. Edit it or archive it before creating another.');
    if (!expectedRevision) {
      invariant(!await StrategyModel.exists({ _id: id }).session(session), 'Strategy already exists. Reload before saving');
      await StrategyModel.create([record], { session });
    } else {
      const previous = await StrategyModel.findOne({ _id: id, revision: expectedRevision }).session(session).lean();
      invariant(previous, 'This strategy changed elsewhere. Reload before saving');
      invariant(!previous.archivedAt,'Archived strategies are read-only. Restore this strategy to its empty slot before editing.');
      invariant(previous.entry.horizon===draft.entry.horizon,'A saved strategy stays in its original holding-period slot.');
      // Preserve a legacy current definition before advancing it. Never overwrite an archived revision.
      await StrategyRevisionModel.updateOne({ _id: `${id}:${expectedRevision}` }, { $setOnInsert: { ...previous, _id: `${id}:${expectedRevision}` } }, { upsert: true, session });
      const result = await StrategyModel.updateOne({ _id: id, revision: expectedRevision }, { $set: record }, { session });
      invariant(result.modifiedCount, 'This strategy changed elsewhere. Reload before saving');
    }
    await StrategyRevisionModel.create([{ ...record, _id: `${id}:${record.revision}` }], { session });
  });
  return record;
}

export async function archiveStrategy(id:string,expectedRevision:number){
 return mongoose.connection.transaction(async session=>{
  const strategy=await StrategyModel.findOne({_id:id,revision:expectedRevision,archivedAt:{$exists:false}}).session(session).lean();
  invariant(strategy,'Strategy changed or was already archived. Refresh before continuing.');
  await StrategySlotModel.updateOne({_id:String(strategy.entry.horizon)},{$inc:{serial:1}},{upsert:true,session});
  await StrategyModel.updateOne({_id:id},{$inc:{lifecycleSerial:1}},{session});
  const sessions=await PaperSessionModel.find({strategyId:id}).select('_id active').session(session).lean();
  invariant(!sessions.some(s=>s.active),'Stop monitoring this strategy before archiving it. Existing sessions keep their saved rules.');
  const ids=sessions.map(s=>s._id);
  invariant(!await PaperPositionModel.exists({sessionId:{$in:ids}}).session(session),"Close this strategy's paper positions before archiving it.");
  invariant(!await PaperOrderModel.exists({sessionId:{$in:ids},status:{$in:['pending','confirmation']}}).session(session),'Cancel pending orders before archiving this strategy.');
  await StrategyRevisionModel.updateOne({_id:`${id}:${strategy.revision}`},{$setOnInsert:{...strategy,_id:`${id}:${strategy.revision}`}},{upsert:true,session});
  const archivedAt=new Date().toISOString();
  await StrategyModel.updateOne({_id:id},{$set:{archivedAt}},{session});
  return {...strategy,archivedAt};
 });
}

/** Restoring is a lifecycle change, never a rule revision or execution action. */
export async function restoreStrategy(id: string, expectedRevision: number, expectedArchivedAt: string) {
  return mongoose.connection.transaction(async session => {
    const strategy = await StrategyModel.findOne({ _id: id, revision: expectedRevision, archivedAt: expectedArchivedAt }).session(session).lean();
    invariant(strategy, 'Strategy changed or was already restored. Refresh before continuing.');
    const horizon = String(strategy.entry.horizon);
    invariant(['intraday', 'swing', 'long-term'].includes(horizon), 'This strategy has an unsupported holding period.');
    // Share the same slot lock as create/archive, including concurrent requests.
    await StrategySlotModel.updateOne({ _id: horizon }, { $inc: { serial: 1 } }, { upsert: true, session });
    invariant(!await StrategyModel.exists({ _id: { $ne: id }, 'entry.horizon': horizon, archivedAt: { $exists: false } }).session(session),
      'A current strategy already occupies this holding-period slot. Archive it first, then restore this strategy.');
    return StrategyModel.findOneAndUpdate({ _id: id, revision: expectedRevision, archivedAt: expectedArchivedAt },
      { $unset: { archivedAt: '' }, $inc: { lifecycleSerial: 1 } }, { session, returnDocument: 'after' }).lean();
  });
}
