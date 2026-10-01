import { AppError } from '../../../shared/errors.js';
import { CandleModel, DailyCloseModel, FactModel, InstrumentModel } from '../../market-data/models/market-data.model.js';
import { latestFacts } from '../../market-data/repository.js';
import type { Fact } from '../../market-data/types.js';
import { rankRelated, relatedFields, relatedUniverse, type RelatedListing } from '../utils/related-stocks.js';

const fields = '_id symbol name exchange isin active primary series';
type PeerData = { stocks: RelatedListing[]; facts: Fact[]; checkedAt: string };
let cached: { expires: number; value: PeerData } | undefined;
let pending: Promise<PeerData> | undefined;
function peerData() {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
  if (pending) return pending;
  pending = (async () => {
    const checkedAt = new Date().toISOString();
    const [stocks, facts] = await Promise.all([
      InstrumentModel.find({ active: true }).select(fields).lean<RelatedListing[]>(),
      FactModel.aggregate<Fact>([
        { $match: { field: { $in: [...relatedFields] }, knownAt: { $lte: checkedAt }, $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: checkedAt } }] } },
        { $set: { sourcePriority: { $cond: [{ $eq: ['$source', 'dhan-public-company'] }, 0, 1] } } },
        { $sort: { sourcePriority: -1, period: -1, knownAt: -1, _id: 1 } },
        { $group: { _id: { instrument: '$instrumentId', field: '$field' }, fact: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$fact' } }, { $project: { sourcePriority: 0, sourceUrl: 0, calculation: 0, ownership: 0 } },
      ]),
    ]);
    const value = { stocks, facts, checkedAt };
    cached = { expires: Date.now() + 300_000, value }; return value;
  })().finally(() => { pending = undefined; });
  return pending;
}
/**
 * Market-wide exchange closes by company (ISIN), keyed back to listing ids. Falls back to
 * stored Dhan candles for a company the daily price job has not reached yet.
 */
async function storedCloses(listings: Pick<RelatedListing, '_id' | 'isin'>[], now: number) {
  const fromDate = new Date(now - 400 * 86_400_000).toISOString().slice(0, 10);
  const byIsin = new Map<string, string[]>();
  for (const listing of listings) if (listing.isin) byIsin.set(listing.isin, [...byIsin.get(listing.isin) ?? [], listing._id]);
  const closes = new Map<string, Map<string, number>>();
  const rows = await DailyCloseModel.find({ isin: { $in: [...byIsin.keys()] }, date: { $gte: fromDate } }).select('isin date close -_id').lean<{ isin: string; date: string; close: number }[]>();
  for (const row of rows) for (const id of byIsin.get(row.isin) ?? []) {
    const series = closes.get(id) ?? new Map<string, number>();
    series.set(row.date, row.close); closes.set(id, series);
  }
  const missing = listings.filter(listing => (closes.get(listing._id)?.size ?? 0) < 60).map(listing => listing._id);
  if (missing.length) {
    const candles = await CandleModel.find({ instrumentId: { $in: missing }, interval: '1d', time: { $gte: `${fromDate}T00:00:00.000Z` } })
      .select('instrumentId time close -_id').lean<{ instrumentId: string; time: string; close: number }[]>();
    const fallback = new Map<string, Map<string, number>>();
    for (const row of candles) {
      if (!(row.close > 0)) continue;
      const series = fallback.get(row.instrumentId) ?? new Map<string, number>();
      series.set(new Date(Date.parse(row.time) + 19_800_000).toISOString().slice(0, 10), row.close); fallback.set(row.instrumentId, series);
    }
    for (const [id, series] of fallback) if (series.size > (closes.get(id)?.size ?? 0)) closes.set(id, series);
  }
  return closes;
}
export async function relatedStocks(id: string) {
  const current = await InstrumentModel.findById(id).select(fields).lean<RelatedListing>();
  if (!current) throw new AppError(404, 'STOCK_NOT_FOUND', 'Stock not found');
  const now = Date.now();
  const [currentFacts, peers] = await Promise.all([latestFacts(id, new Date(now).toISOString()), peerData()]);
  const universe = relatedUniverse({ current, currentFacts, stocks: peers.stocks, facts: peers.facts });
  const closes = await storedCloses([current], now);
  // Co-movement needs the viewed stock's own history; skip the peer query without it.
  if ((closes.get(current._id)?.size ?? 0) > 60) {
    const byId = new Map(peers.stocks.map(stock => [stock._id, stock]));
    const pool = universe.poolIds.flatMap(poolId => byId.has(poolId) ? [byId.get(poolId)!] : []);
    for (const [key, series] of await storedCloses(pool, now)) closes.set(key, series);
  }
  return { ...rankRelated(current, universe, closes), checkedAt: peers.checkedAt };
}
