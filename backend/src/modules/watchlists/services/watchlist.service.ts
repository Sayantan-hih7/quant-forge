import mongoose, { type QueryFilter } from 'mongoose';
import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import type { Instrument } from '../../market-data/types.js';
import { WatchlistModel } from '../models/watchlist.model.js';
import { browseStocksSchema } from '../validations/watchlist.validation.js';
import { AppError, invariant } from '../../../shared/errors.js';

export const personalWatchlistId = 'personal';
export async function personalWatchlist() {
  const existing = await WatchlistModel.findById(personalWatchlistId).lean();
  if (existing) return existing;
  // Merge once, in one transaction. Retain original lists as archives; never
  // re-import their members after a user removes a stock from the new list.
  try {
    return await mongoose.connection.transaction(async session => {
      const current = await WatchlistModel.findById(personalWatchlistId).session(session).lean();
      if (current) return current;
      const legacy = await WatchlistModel.find({ archivedAt: { $exists: false } }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
      const now = new Date().toISOString();
      const [list] = await WatchlistModel.create([{ _id: personalWatchlistId, name: 'Watchlist',
        ids: [...new Set(legacy.flatMap(item => item.ids))], createdAt: legacy[0]?.createdAt ?? now, updatedAt: now }], { session });
      await WatchlistModel.updateMany({ _id: { $in: legacy.map(item => item._id) } }, { $set: { archivedAt: now } }, { session });
      return list.toObject();
    });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      const winner = await WatchlistModel.findById(personalWatchlistId).lean();
      if (winner) return winner;
    }
    throw error;
  }
}
export async function getWatchlist(id: string) {
  if (id !== personalWatchlistId && !await WatchlistModel.exists({ _id: id })) throw new AppError(404, 'NOT_FOUND', 'Watchlist not found');
  return personalWatchlist();
}
export async function listWatchlists() {
  const [list, universeCount] = await Promise.all([personalWatchlist(), InstrumentModel.countDocuments({ active: true })]);
  return { lists: [list], universeCount };
}
export async function addWatchlistStock(id: string, instrumentId: string) {
  invariant(await InstrumentModel.exists({ _id: instrumentId, active: true }), 'Choose an active cash stock from the stock universe.');
  const current = await getWatchlist(id);
  // Bound one list without racing concurrent additions; duplicate additions are idempotent.
  const list = await WatchlistModel.findOneAndUpdate({ _id: current._id, $or: [{ ids: instrumentId }, { 'ids.9999': { $exists: false } }] },
    { $addToSet: { ids: instrumentId }, $set: { updatedAt: new Date().toISOString() } }, { returnDocument: 'after' }).lean();
  if (!list) throw new AppError(422, 'WATCHLIST_FULL', 'Your watchlist has 10,000 stocks. Remove a stock before adding another.');
  return list;
}
export async function removeWatchlistStock(id: string, instrumentId: string) {
  const current = await getWatchlist(id);
  const list = await WatchlistModel.findByIdAndUpdate(current._id, { $pull: { ids: instrumentId }, $set: { updatedAt: new Date().toISOString() } }, { returnDocument: 'after' }).lean();
  if (!list) throw new AppError(404, 'NOT_FOUND', 'Watchlist not found');
  return list;
}
export async function browseStocks(raw: unknown) {
  const input = browseStocksSchema.parse(raw);
  const list = input.listId ? await getWatchlist(input.listId) : undefined;
  const filter: QueryFilter<Instrument> = list ? { _id: { $in: list.ids } } : { active: true };
  if (input.exchange) filter.exchange = input.exchange;
  if (input.q) {
    const pattern = input.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['symbol', 'name', 'isin'].map(field => ({ [field]: { $regex: pattern, $options: 'i' } }));
  }
  const total = await InstrumentModel.countDocuments(filter), page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
  const items = await InstrumentModel.find(filter).select('_id symbol name exchange isin active').sort({ [input.sort]: input.order === 'asc' ? 1 : -1, _id: 1 })
    .skip((page - 1) * input.pageSize).limit(input.pageSize).lean();
  return { items, total, page, pageSize: input.pageSize };
}
