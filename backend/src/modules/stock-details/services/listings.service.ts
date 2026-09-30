import { AppError } from '../../../shared/errors.js';
import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import type { Instrument } from '../../market-data/types.js';

type Listing = Pick<Instrument, '_id' | 'symbol' | 'name' | 'exchange' | 'isin' | 'active' | 'primary' | 'series'>;
const fields = '_id symbol name exchange isin active primary series';

// ISIN identifies the security across exchanges. Symbols/names can differ, or
// be reused for unrelated securities, so neither is a safe matching key.
export async function stockListings(id: string) {
  const instrument = await InstrumentModel.findById(id).select(fields).lean<Listing>();
  if (!instrument) throw new AppError(404, 'STOCK_NOT_FOUND', 'Stock not found');
  const candidates = instrument.isin
    ? await InstrumentModel.find({ isin: instrument.isin, active: true, exchange: { $in: ['NSE', 'BSE'] } }).select(fields).lean<Listing[]>()
    : [];
  const listings = (['NSE', 'BSE'] as const).flatMap(exchange => {
    const rows = candidates.filter(row => row.exchange === exchange).sort((a, b) =>
      Number(b._id === id) - Number(a._id === id) || Number(b.primary) - Number(a.primary)
      || Number(b.series === 'EQ') - Number(a.series === 'EQ') || a._id.localeCompare(b._id));
    return rows.slice(0, 1);
  });
  return { instrument, listings };
}
