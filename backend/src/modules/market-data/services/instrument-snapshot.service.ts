import mongoose from 'mongoose';
import { invariant } from '../../../shared/errors.js';
import { instruments } from '../repository.js';
import type { Instrument } from '../types.js';

export function validateInstrumentSnapshot(rows: Instrument[], previous: Pick<Instrument, '_id' | 'exchange' | 'isin' | 'active'>[]) {
  invariant(new Set(rows.map(row => row._id)).size === rows.length, 'Duplicate instruments in the stock master; previous universe retained');
  for (const exchange of ['NSE', 'BSE'] as const) {
    const count = rows.filter(row => row.exchange === exchange && row.active).length;
    const oldCount = previous.filter(row => row.exchange === exchange && row.active).length;
    invariant(count >= (exchange === 'NSE' ? 500 : 1000) && (!oldCount || count >= oldCount * 0.8),
      `${exchange} stock master appears incomplete; previous universe retained`);
  }
  const byId = new Map(previous.map(row => [row._id, row]));
  invariant(rows.every(row => !byId.has(row._id) || byId.get(row._id)!.isin === row.isin),
    'A provider instrument ID changed company identity; review the mapping before replacing the stock universe');
}

export async function publishInstrumentSnapshot(rows: Instrument[]) {
  return mongoose.connection.transaction(async session => {
    const previous = await instruments.find().select('_id exchange isin active').session(session).lean();
    validateInstrumentSnapshot(rows, previous);
    const existing = new Map(previous.map(row => [row._id, row]));
    const knownCompanies = new Set(previous.map(row => row.isin));
    const incomingIds = new Set(rows.map(row => row._id));
    const activeIds = new Set(rows.filter(row => row.active).map(row => row._id));
    const stats = {
      listings: rows.filter(row => row.active).length,
      companies: new Set(rows.filter(row => row.active).map(row => row.isin)).size,
      addedListings: rows.filter(row => !existing.has(row._id)).length,
      addedCompanies: new Set(rows.filter(row => !knownCompanies.has(row.isin)).map(row => row.isin)).size,
      reactivatedListings: rows.filter(row => row.active && existing.has(row._id) && !existing.get(row._id)!.active).length,
      deactivatedListings: previous.filter(row => row.active && !activeIds.has(row._id)).length,
    };
    for (let i = 0; i < rows.length; i += 500) {
      await instruments.bulkWrite(rows.slice(i, i + 500).map(row => ({ updateOne: {
        filter: { _id: row._id }, update: { $set: row }, upsert: true,
      } })), { session });
    }
    // Keep historical records and broker mappings; delisted/missing listings are only made inactive.
    await instruments.updateMany({ _id: { $nin: [...incomingIds] } }, { $set: { active: false, primary: false } }, { session });
    return stats;
  });
}
