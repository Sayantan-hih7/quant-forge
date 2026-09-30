import { AppError } from '../../../shared/errors.js';
import { FactModel, InstrumentModel } from '../../market-data/models/market-data.model.js';
import { latestFacts } from '../../market-data/repository.js';
import type { Fact } from '../../market-data/types.js';
import { selectRelatedStocks, type RelatedListing } from '../utils/related-stocks.js';

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
        { $match: { field: { $in: ['sector', 'marketCap'] }, knownAt: { $lte: checkedAt }, $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: checkedAt } }] } },
        { $set: { sourcePriority: { $cond: [{ $eq: ['$source', 'dhan-public-company'] }, 0, 1] } } },
        { $sort: { sourcePriority: -1, period: -1, knownAt: -1, _id: 1 } },
        { $group: { _id: { instrument: '$instrumentId', field: '$field' }, fact: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$fact' } }, { $unset: 'sourcePriority' },
      ]),
    ]);
    const value = { stocks, facts, checkedAt };
    cached = { expires: Date.now() + 300_000, value }; return value;
  })().finally(() => { pending = undefined; });
  return pending;
}
export async function relatedStocks(id: string) {
  const current = await InstrumentModel.findById(id).select(fields).lean<RelatedListing>();
  if (!current) throw new AppError(404, 'STOCK_NOT_FOUND', 'Stock not found');
  const [currentFacts, peers] = await Promise.all([latestFacts(id, new Date().toISOString()), peerData()]);
  return { ...selectRelatedStocks(current, currentFacts, peers.stocks, peers.facts), checkedAt: peers.checkedAt };
}
