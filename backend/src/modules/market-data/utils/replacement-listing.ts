import type { Instrument } from '../types.js';

export type Listing = Pick<Instrument, '_id' | 'exchange' | 'isin' | 'symbol' | 'active' | 'primary'>;
/**
 * The active listing that continues a deactivated one: same company (ISIN), same exchange first, then the
 * company's primary listing. Exchanges/providers occasionally reissue a security ID for the same company.
 */
export function replacementListing(dead: Listing, candidates: Listing[]) {
  const active = candidates.filter(x => x.active && x.isin === dead.isin && x._id !== dead._id);
  return active.find(x => x.exchange === dead.exchange) ?? active.find(x => x.primary) ?? active[0];
}
