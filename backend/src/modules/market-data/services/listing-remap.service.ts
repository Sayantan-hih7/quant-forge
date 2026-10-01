import mongoose from 'mongoose';
import { instruments } from '../repository.js';
import { replacementListing, type Listing } from '../utils/replacement-listing.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { recordUniverseSnapshot, currentMonth } from '../../qualification/services/universe.service.js';
import { WatchlistModel } from '../../watchlists/models/watchlist.model.js';

/** Moves the current qualified list and watchlists off listings the universe refresh deactivated. */
export async function remapInactiveListings() {
  const [universe, lists] = await Promise.all([
    MonthlyUniverseModel.findById(currentMonth()).lean(),
    WatchlistModel.find({ archivedAt: { $exists: false } }).lean(),
  ]);
  const referenced = [...new Set([...(universe?.members ?? []).map(m => m.instrumentId), ...lists.flatMap(l => l.ids)])];
  if (!referenced.length) return { qualified: [], watchlists: [] };
  const dead = await instruments.find({ _id: { $in: referenced }, active: false }).select('_id exchange isin symbol active primary').lean<Listing[]>();
  if (!dead.length) return { qualified: [], watchlists: [] };
  const candidates = await instruments.find({ isin: { $in: dead.map(x => x.isin) }, active: true }).select('_id exchange isin symbol active primary').lean<Listing[]>();
  const moves = new Map(dead.flatMap(x => { const next = replacementListing(x, candidates); return next ? [[x._id, next] as const] : []; }));
  const qualified: { from: string; to: string; symbol: string }[] = [], watchlists: { list: string; from: string; to: string }[] = [];

  if (universe && universe.members.some(m => moves.has(m.instrumentId))) {
    await mongoose.connection.transaction(async session => {
      const current = await MonthlyUniverseModel.findById(universe._id).session(session).lean();
      if (!current) return;
      const members = current.members.map(member => {
        const next = moves.get(member.instrumentId);
        if (!next) return member;
        qualified.push({ from: member.instrumentId, to: next._id, symbol: next.symbol });
        return { ...member, instrumentId: next._id };
      });
      if (!qualified.length) return;
      // Revision-guarded so a concurrent publish or manual edit is never overwritten.
      const result = await MonthlyUniverseModel.findOneAndUpdate({ _id: current._id, revision: current.revision },
        { $set: { members, publishedAt: new Date().toISOString() }, $inc: { revision: 1 } }, { session, returnDocument: 'after' }).lean();
      if (result) await recordUniverseSnapshot(result, session); else qualified.length = 0;
    });
  }
  for (const list of lists) {
    if (!list.ids.some(id => moves.has(id))) continue;
    const ids: string[] = [];
    for (const id of list.ids) {
      const next = moves.get(id)?._id ?? id;
      if (next !== id) watchlists.push({ list: list.name, from: id, to: next });
      if (!ids.includes(next)) ids.push(next);
    }
    await WatchlistModel.updateOne({ _id: list._id, ids: list.ids }, { $set: { ids, updatedAt: new Date().toISOString() } });
  }
  return { qualified, watchlists };
}
