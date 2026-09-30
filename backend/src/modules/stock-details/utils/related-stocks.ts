import type { Fact, Instrument } from '../../market-data/types.js';

export type RelatedListing = Pick<Instrument, '_id' | 'symbol' | 'name' | 'exchange' | 'isin' | 'active' | 'primary' | 'series'>;
function sectorName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return !name || /^(unknown|other|others|n\/?a|not available|unclassified|-|—)$/i.test(name) ? null : name;
}
function positive(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null; }

// Inputs are the latest valid facts for each instrument/field, not scan results.
export function selectRelatedStocks(current: RelatedListing, currentFacts: Fact[], stocks: RelatedListing[], facts: Fact[]) {
  const sectorFact = currentFacts.find(fact => fact.field === 'sector');
  const sector = sectorName(sectorFact?.value);
  const currentCap = positive(currentFacts.find(fact => fact.field === 'marketCap')?.value);
  if (!sector) return { sector: null, sectorObservedAt: null, items: [], ordering: 'alphabetical' as const, message: 'Related stocks need a reported sector for this company.' };
  const byId = new Map<string, Map<string, Fact>>();
  for (const fact of facts) {
    const fields = byId.get(fact.instrumentId) ?? new Map<string, Fact>();
    fields.set(fact.field, fact); byId.set(fact.instrumentId, fields);
  }
  const seen = new Set<string>();
  const candidates = [...stocks].filter(stock => stock.active && stock.exchange === current.exchange && stock._id !== current._id && (!current.isin || stock.isin !== current.isin))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.series === 'EQ') - Number(a.series === 'EQ') || a._id.localeCompare(b._id))
    .filter(stock => { const key = stock.isin || stock._id; if (seen.has(key)) return false; seen.add(key); return true; })
    .flatMap(stock => {
      const fields = byId.get(stock._id), peerSector = sectorName(fields?.get('sector')?.value);
      if (peerSector?.toLowerCase() !== sector.toLowerCase()) return [];
      const cap = fields?.get('marketCap');
      return [{ ...stock, sector: peerSector, marketCap: positive(cap?.value), marketCapObservedAt: cap?.observedAt ?? null }];
    });
  const distance = (cap: number | null) => currentCap && cap ? Math.abs(Math.log(cap / currentCap)) : Number.POSITIVE_INFINITY;
  candidates.sort((a, b) => (distance(a.marketCap) - distance(b.marketCap)) || a.symbol.localeCompare(b.symbol) || a._id.localeCompare(b._id));
  return { sector, sectorObservedAt: sectorFact?.observedAt ?? null, items: candidates.slice(0, 6),
    ordering: currentCap && candidates.some(stock => stock.marketCap) ? 'similar-market-cap' as const : 'alphabetical' as const,
    message: candidates.length ? null : `No other active ${current.exchange} stocks with matching sector data are available yet.` };
}
