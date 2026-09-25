import { InstrumentModel, FactModel, DeliveryDayModel, CandleModel, SourceRunModel } from './models/market-data.model.js';
import type { Fact } from './types.js';

export const instruments = InstrumentModel;
export const facts = FactModel;
export const deliveryDays = DeliveryDayModel;
export const sourceRuns = SourceRunModel;
export const storedCandles = CandleModel;
export async function writeFacts(rows: Fact[]) {
  for (let i = 0; i < rows.length; i += 500) await facts.bulkWrite(rows.slice(i, i + 500).map(x => ({
    updateOne: { filter: { _id: x._id }, update: { $setOnInsert: x }, upsert: true },
  })));
}
export async function latestFacts(instrumentId: string, cutoff: string) {
  return facts.aggregate<Fact>([
    { $match: { instrumentId, knownAt: { $lte: cutoff }, $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: cutoff } }] } },
    { $set: { sourcePriority: { $cond: [{ $eq: ['$source', 'dhan-public-company'] }, 0, 1] } } },
    { $sort: { sourcePriority: -1, period: -1, knownAt: -1 } }, { $group: { _id: '$field', fact: { $first: '$$ROOT' } } }, { $replaceRoot: { newRoot: '$fact' } },
    { $unset: 'sourcePriority' },
  ]).exec();
}
