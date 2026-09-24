import mongoose, { type ClientSession } from 'mongoose';
import { invariant } from '../../../shared/errors.js';
import { announce } from '../../../shared/redis.js';
import { facts, instruments } from '../../market-data/repository.js';
import type { Fact } from '../../market-data/types.js';
import { MonthlyUniverseModel, UniverseSnapshotModel, type MonthlyUniverse } from '../models/qualification.model.js';

export const currentMonth = () => new Date(Date.now() + 19800000).toISOString().slice(0, 7);
export async function recordUniverseSnapshot(universe: MonthlyUniverse, session: ClientSession) {
  await UniverseSnapshotModel.create([{ ...universe, _id: `${universe.month}:${universe.revision}` }], { session });
}
export async function addManualStock(instrumentId: string, note: string) {
  await mongoose.connection.transaction(async session => {
    const stock = await instruments.findOne({ _id: instrumentId, active: true }).session(session).lean();
    invariant(stock, 'Unknown stock');
    const result = await MonthlyUniverseModel.findOneAndUpdate({ _id: currentMonth(), 'members.isin': { $ne: stock.isin } }, {
      $push: { members: { instrumentId: stock._id, isin: stock.isin, source: 'manual', addedAt: new Date().toISOString(), note } },
      $inc: { revision: 1 }, $set: { publishedAt: new Date().toISOString() },
    }, { session, returnDocument: 'after' }).lean();
    invariant(result, 'Publish a monthly list first; this company may already be included');
    await recordUniverseSnapshot(result, session);
  });
  await announce('qualification.changed');
}
export async function removeManualStocks(instrumentId?: string) {
  await mongoose.connection.transaction(async session => {
    const member = { source: 'manual' as const, ...(instrumentId ? { instrumentId } : {}) };
    const result = await MonthlyUniverseModel.findOneAndUpdate({ _id: currentMonth(), members: { $elemMatch: member } }, {
      $pull: { members: member }, $inc: { revision: 1 }, $set: { publishedAt: new Date().toISOString() },
    }, { session, returnDocument: 'after' }).lean();
    if (instrumentId) invariant(result, 'Only manually added stocks can be removed');
    if (result) await recordUniverseSnapshot(result, session);
  });
  await announce('qualification.changed');
}

export async function qualifiedStocks() {
  const universe = await MonthlyUniverseModel.findById(currentMonth()).lean();
  const members = universe?.members ?? [], ids = members.map(x => x.instrumentId), now = new Date().toISOString();
  const [stocks, observations] = await Promise.all([
    instruments.find({ _id: { $in: ids } }).lean(),
    facts.aggregate<Fact>([
      { $match: { instrumentId: { $in: ids }, knownAt: { $lte: now }, $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: now } }] } },
      { $sort: { period: -1, knownAt: -1 } }, { $group: { _id: { stock: '$instrumentId', field: '$field' }, fact: { $first: '$$ROOT' } } }, { $replaceRoot: { newRoot: '$fact' } },
    ]),
  ]);
  return members.map(member => ({ ...member, instrument: stocks.find(x => x._id === member.instrumentId),
    metrics: Object.fromEntries(observations.filter(x => x.instrumentId === member.instrumentId).map(x => [x.field, x.value])),
  }));
}
