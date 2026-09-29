import { randomUUID } from 'node:crypto';
import type { QueryFilter } from 'mongoose';
import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import type { Instrument } from '../../market-data/types.js';
import { WatchlistModel } from '../models/watchlist.model.js';
import { browseStocksSchema, watchlistName } from '../validations/watchlist.validation.js';
import { AppError, invariant } from '../../../shared/errors.js';

export async function getWatchlist(id: string) {
  const list = await WatchlistModel.findById(id).lean();
  if (!list) throw new AppError(404, 'NOT_FOUND', 'This watchlist no longer exists. Choose another list.');
  return list;
}
export async function listWatchlists() {
  const [lists, universeCount] = await Promise.all([WatchlistModel.find().sort({ createdAt: 1 }).lean(), InstrumentModel.countDocuments({ active: true })]);
  return { lists, universeCount };
}
export async function saveWatchlist(raw: unknown, id?: string) {
  const { name } = watchlistName.parse(raw), now = new Date().toISOString();
  if (!id) return WatchlistModel.create({ _id: randomUUID(), name, ids: [], createdAt: now, updatedAt: now });
  const updated = await WatchlistModel.findByIdAndUpdate(id, { $set: { name, updatedAt: now } }, { returnDocument: 'after' }).lean();
  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Watchlist not found');
  return updated;
}
export async function addWatchlistStock(id: string, instrumentId: string) {
  invariant(await InstrumentModel.exists({ _id: instrumentId, active: true }), 'Choose an active cash stock from the stock universe.');
  // Bound one list without racing concurrent additions; duplicate additions are idempotent.
  const list = await WatchlistModel.findOneAndUpdate({ _id: id, $or: [{ ids: instrumentId }, { 'ids.499': { $exists: false } }] },
    { $addToSet: { ids: instrumentId }, $set: { updatedAt: new Date().toISOString() } }, { returnDocument: 'after' }).lean();
  if (!list) { await getWatchlist(id); throw new AppError(422, 'WATCHLIST_FULL', 'This list has 500 stocks. Create another list or remove a stock first.'); }
  return list;
}
export async function removeWatchlistStock(id: string, instrumentId: string) {
  const list = await WatchlistModel.findByIdAndUpdate(id, { $pull: { ids: instrumentId }, $set: { updatedAt: new Date().toISOString() } }, { returnDocument: 'after' }).lean();
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
