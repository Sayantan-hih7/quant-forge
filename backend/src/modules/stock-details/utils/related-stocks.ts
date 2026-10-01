import type { Fact, Instrument } from '../../market-data/types.js';
import { INDEX_SOURCES } from '../../market-data/sources/index-membership.js';

export type RelatedListing = Pick<Instrument, '_id' | 'symbol' | 'name' | 'exchange' | 'isin' | 'active' | 'primary' | 'series'>;
export const relatedFields = ['sector', 'industry', 'marketCap', 'pe', 'pb', 'roe', 'roce', 'debtEquity', 'dividendYield', 'turnover', 'index'] as const;
export type CapBandKey = 'large' | 'mid' | 'small' | 'micro';
export interface CapBand { key: CapBandKey; label: string; rank: number; of: number }
export interface Profile {
  sector: string | null; industry: string | null; marketCap: number | null; marketCapObservedAt: string | null;
  pe: number | null; pb: number | null; roe: number | null; roce: number | null; debtEquity: number | null; dividendYield: number | null;
  /** Null when membership was never imported; [] means a known non-member. */
  turnover: number | null; indices: string[] | null; band: CapBand | null;
}
export interface Reason { key: string; label: string }
export interface RelatedItem extends RelatedListing, Profile {
  score: number; strength: 'close' | 'good' | 'partial'; reasons: Reason[]; correlation: number | null; sectorRank: number | null;
}
export type LensKey = 'peers' | 'size' | 'leaders';
export interface Lens { key: LensKey; label: string; description: string; items: RelatedItem[]; message: string | null }

const LIMIT = 12;
// SEBI/AMFI categorisation ranks companies by full market cap. Micro cap (501+) is
// the common NIFTY Microcap convention; SEBI itself groups it inside small cap.
const BANDS: [number, CapBandKey, string][] = [[100, 'large', 'Large cap'], [250, 'mid', 'Mid cap'], [500, 'small', 'Small cap'], [Infinity, 'micro', 'Micro cap']];
// Too few saved caps would misplace companies; ranks need most of the listed universe.
export const MIN_RANKED_COMPANIES = 750;
const indexName = new Map(INDEX_SOURCES.map(source => [source.id, source.name]));
const broadIndices = ['nifty-50', 'bse-sensex', 'nifty-next-50', 'nifty-100', 'bse-100', 'nifty-midcap-150', 'nifty-200', 'bse-200',
  'nifty-smallcap-250', 'nifty-microcap-250', 'nifty-500', 'bse-500', 'nifty-india-manufacturing', 'nifty-total-market'];
// Sharing one of these says almost nothing about two companies.
const tooBroad = new Set(['nifty-500', 'bse-500', 'nifty-india-manufacturing', 'nifty-total-market']);
// Sectoral indices say more than broad ones; among broad ones, the narrowest wins.
const specificity = (id: string) => broadIndices.includes(id) ? broadIndices.indexOf(id) + 1 : 0;

function label(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return !name || /^(unknown|other|others|n\/?a|not available|unclassified|-|—)$/i.test(name) ? null : name;
}
const same = (a: string | null, b: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const positive = (value: unknown) => { const n = finite(value); return n !== null && n > 0 ? n : null; };
const ratio = (a: number, b: number) => Math.exp(Math.abs(Math.log(a / b)));
const times = (r: number) => r < 1.05 ? 'about the same' : `${r < 10 ? r.toFixed(1) : Math.round(r)}×`;

export function profileOf(facts: Iterable<Fact>): Omit<Profile, 'band'> {
  const by = new Map<string, Fact>();
  for (const fact of facts) by.set(fact.field, fact);
  const cap = by.get('marketCap'), indices = by.get('index')?.value;
  return {
    sector: label(by.get('sector')?.value), industry: label(by.get('industry')?.value),
    marketCap: positive(cap?.value), marketCapObservedAt: positive(cap?.value) ? cap!.observedAt : null,
    // Negative earnings or book value make P/E and P/B meaningless for comparison.
    pe: positive(by.get('pe')?.value), pb: positive(by.get('pb')?.value),
    roe: finite(by.get('roe')?.value), roce: finite(by.get('roce')?.value),
    debtEquity: (() => { const n = finite(by.get('debtEquity')?.value); return n !== null && n >= 0 ? n : null; })(),
    dividendYield: (() => { const n = finite(by.get('dividendYield')?.value); return n !== null && n >= 0 ? n : null; })(),
    turnover: positive(by.get('turnover')?.value),
    indices: Array.isArray(indices) ? indices.filter((id): id is string => typeof id === 'string' && indexName.has(id)) : null,
  };
}

/** One market cap per company (ISIN), ranked descending. */
export function capRanks(stocks: RelatedListing[], caps: Map<string, number>) {
  const byCompany = new Map<string, number>();
  for (const stock of stocks) {
    const cap = caps.get(stock._id); if (!cap) continue;
    const key = stock.isin || stock._id;
    byCompany.set(key, Math.max(byCompany.get(key) ?? 0, cap));
  }
  const sorted = [...byCompany.values()].sort((a, b) => b - a);
  return { of: sorted.length, band(cap: number | null): CapBand | null {
    if (!cap || sorted.length < MIN_RANKED_COMPANIES) return null;
    let lo = 0, hi = sorted.length; // first index with value < cap
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] >= cap) lo = mid + 1; else hi = mid; }
    const rank = Math.max(1, lo), [, key, name] = BANDS.find(([max]) => rank <= max)!;
    return { key, label: name, rank, of: sorted.length };
  } };
}

/** Pearson correlation of daily log returns on shared sessions. */
export function returnCorrelation(a: Map<string, number>, b: Map<string, number>, minSessions = 60) {
  const dates = [...a.keys()].filter(date => b.has(date)).sort();
  const xs: number[] = [], ys: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const [pa, ca, pb, cb] = [a.get(dates[i - 1])!, a.get(dates[i])!, b.get(dates[i - 1])!, b.get(dates[i])!];
    if (!(pa > 0 && ca > 0 && pb > 0 && cb > 0)) continue;
    const x = Math.log(ca / pa), y = Math.log(cb / pb);
    // Exchange closes are unadjusted: a ±30%+ day is a split/bonus, not a price move.
    if (Math.abs(x) > 0.35 || Math.abs(y) > 0.35) continue;
    xs.push(x); ys.push(y);
  }
  if (xs.length < minSessions) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? Math.round(sxy / Math.sqrt(sxx * syy) * 100) / 100 : null;
}

type Component = { weight: number; value: number | null; reason?: Reason };
// Unknown data scores like a typical unrelated company: neither a match nor a mismatch.
const UNKNOWN = 0.3;
function compare(subject: Profile, peer: Profile, correlation: number | null) {
  const s = subject, p = peer;
  const sizeRatio = s.marketCap && p.marketCap ? ratio(s.marketCap, p.marketCap) : null;
  const peRatio = s.pe && p.pe ? ratio(s.pe, p.pe) : null;
  const pbRatio = s.pb && p.pb ? ratio(s.pb, p.pb) : null;
  const tvRatio = s.turnover && p.turnover ? ratio(s.turnover, p.turnover) : null;
  const ret = (a: number | null, b: number | null) => a !== null && b !== null ? Math.abs(a - b) : null;
  const roce = ret(s.roce, p.roce), roe = ret(s.roe, p.roe);
  const debt = s.debtEquity !== null && p.debtEquity !== null ? Math.abs(Math.log1p(s.debtEquity) - Math.log1p(p.debtEquity)) : null;
  const yieldGap = ret(s.dividendYield, p.dividendYield);
  const bothPayers = (s.dividendYield ?? 0) >= 1 && (p.dividendYield ?? 0) >= 1;
  const shared = s.indices && p.indices ? s.indices.filter(id => p.indices!.includes(id)).sort((a, b) => specificity(a) - specificity(b)) : [];
  // Two non-members of every index share "small and unindexed" — mild evidence, not none.
  const union = s.indices && p.indices ? new Set([...s.indices, ...p.indices]).size : null;
  const indexValue = union === null ? null : union ? shared.length / union : 0.5;
  // Bands are wide (micro spans ~100×), so sharing one only counts between comparable sizes.
  const sameIndustry = same(s.industry, p.industry), sameBand = !!s.band && s.band.key === p.band?.key && sizeRatio !== null && sizeRatio <= 4;
  const components: Component[] = [
    { weight: 3, value: s.industry && p.industry ? Number(sameIndustry) : null, reason: sameIndustry ? { key: 'industry', label: `Same industry · ${p.industry}` } : undefined },
    { weight: 3, value: sizeRatio === null ? null : Math.exp(-Math.log(sizeRatio) / Math.log(3)) * 0.8 + (sameBand ? 0.2 : 0),
      reason: sizeRatio !== null && sizeRatio <= 2 ? { key: 'size', label: `Similar size (${times(sizeRatio)})` } : sameBand ? { key: 'band', label: `Also ${p.band!.label.toLowerCase()}` } : undefined },
    { weight: 1.5, value: peRatio === null ? null : Math.exp(-Math.log(peRatio) / 0.6), reason: peRatio !== null && peRatio <= 1.3 ? { key: 'pe', label: 'Similar P/E' } : undefined },
    { weight: 0.5, value: pbRatio === null ? null : Math.exp(-Math.log(pbRatio) / 0.6) },
    { weight: 1.25, value: roce === null ? null : Math.exp(-roce / 8), reason: roce !== null && roce <= 4 ? { key: 'roce', label: 'Similar ROCE' } : undefined },
    { weight: 0.75, value: roe === null ? null : Math.exp(-roe / 8) },
    { weight: 1, value: debt === null ? null : Math.exp(-debt / 0.35), reason: debt !== null && debt <= 0.1 && s.debtEquity! < 0.1 && p.debtEquity! < 0.1 ? { key: 'debt', label: 'Both nearly debt-free' } : debt !== null && debt <= 0.15 ? { key: 'debt', label: 'Similar leverage' } : undefined },
    { weight: 0.5, value: yieldGap === null ? null : Math.exp(-yieldGap / 1.5), reason: yieldGap !== null && bothPayers && yieldGap <= 0.75 ? { key: 'yield', label: 'Similar dividend yield' } : undefined },
    { weight: 0.75, value: tvRatio === null ? null : Math.exp(-Math.log(tvRatio) / Math.log(4)), reason: tvRatio !== null && tvRatio <= 1.6 ? { key: 'liquidity', label: 'Similar trading liquidity' } : undefined },
    { weight: 1, value: indexValue, reason: shared.length && !tooBroad.has(shared[0]) ? { key: 'index', label: `Both in ${indexName.get(shared[0])}` } : undefined },
  ];
  let total = 0, weights = 0;
  for (const c of components) { total += c.weight * (c.value ?? UNKNOWN); weights += c.weight; }
  // Co-movement is only known for stocks with stored history, so it can lift a peer but never sink one.
  const lift = correlation !== null && correlation > 0.3 ? (correlation - 0.3) * 0.15 : 0;
  const score = Math.min(1, total / weights + lift);
  const reasons = components.filter(c => c.reason).sort((a, b) => b.weight * (b.value ?? 0) - a.weight * (a.value ?? 0)).map(c => c.reason!);
  if (correlation !== null && correlation >= 0.5) reasons.splice(1, 0, { key: 'correlation', label: `Moves together (ρ ${correlation.toFixed(2)})` });
  return { score, reasons };
}
const strength = (score: number) => score >= 0.72 ? 'close' as const : score >= 0.55 ? 'good' as const : 'partial' as const;

export interface RelatedInput {
  current: RelatedListing; currentFacts: Fact[]; stocks: RelatedListing[]; facts: Fact[];
  /** Daily closes by instrument and session date, for whichever stocks have stored history. */
  closes?: Map<string, Map<string, number>>;
}

/** Profiles and candidate pools; the caller loads stored closes for these ids before ranking. */
export function relatedUniverse({ current, currentFacts, stocks, facts }: Omit<RelatedInput, 'closes'>) {
  const byId = new Map<string, Fact[]>();
  for (const fact of facts) { const rows = byId.get(fact.instrumentId); if (rows) rows.push(fact); else byId.set(fact.instrumentId, [fact]); }
  const profiles = new Map<string, Omit<Profile, 'band'>>();
  for (const stock of stocks) profiles.set(stock._id, profileOf(byId.get(stock._id) ?? []));
  const ranks = capRanks(stocks, new Map([...profiles].flatMap(([id, p]) => p.marketCap ? [[id, p.marketCap]] : [])));
  const own = profileOf(currentFacts);
  const subject: Profile = { ...own, band: ranks.band(own.marketCap) };
  const seen = new Set<string>();
  const candidates = [...stocks].filter(stock => stock.active && stock.exchange === current.exchange && stock._id !== current._id && (!current.isin || stock.isin !== current.isin))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.series === 'EQ') - Number(a.series === 'EQ') || a._id.localeCompare(b._id))
    .filter(stock => { const key = stock.isin || stock._id; if (seen.has(key)) return false; seen.add(key); return true; })
    .map(stock => { const profile = profiles.get(stock._id)!; return { ...stock, ...profile, band: ranks.band(profile.marketCap) }; });
  const inSector = (p: Profile) => same(p.sector, subject.sector) || same(p.industry, subject.industry);
  const pre = (p: Profile) => compare(subject, p, null).score;
  const peerPool = candidates.filter(inSector).map(c => ({ c, s: pre(c) })).sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.c);
  const sizePool = !subject.marketCap ? [] : candidates.filter(c => !inSector(c) && c.marketCap && (subject.band ? c.band?.key === subject.band.key : ratio(c.marketCap, subject.marketCap!) <= 2))
    .map(c => ({ c, s: pre(c) })).sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.c);
  const sectorPeers = candidates.filter(inSector);
  const leaderPool = sectorPeers.filter(c => c.marketCap).sort((a, b) => b.marketCap! - a.marketCap! || a.symbol.localeCompare(b.symbol)).slice(0, LIMIT);
  return { subject, sectorPeers, peerPool, sizePool, leaderPool, rankedCompanies: ranks.of,
    poolIds: [...new Set([...peerPool, ...sizePool, ...leaderPool].map(c => c._id))] };
}

export function selectRelatedStocks(input: RelatedInput) { return rankRelated(input.current, relatedUniverse(input), input.closes); }
export function rankRelated(current: RelatedListing, universe: ReturnType<typeof relatedUniverse>, closes?: Map<string, Map<string, number>>) {
  const { subject, sectorPeers, peerPool, sizePool, leaderPool, rankedCompanies } = universe;
  const ownCloses = closes?.get(current._id);
  const sectorRanked = [...sectorPeers.filter(c => c.marketCap), ...(subject.marketCap ? [{ _id: current._id, marketCap: subject.marketCap }] : [])]
    .sort((a, b) => b.marketCap! - a.marketCap!);
  const sectorRank = (id: string) => { const i = sectorRanked.findIndex(c => c._id === id); return i < 0 ? null : i + 1; };
  const build = (c: (typeof sectorPeers)[number]): RelatedItem => {
    const peerCloses = closes?.get(c._id);
    const correlation = ownCloses && peerCloses ? returnCorrelation(ownCloses, peerCloses) : null;
    const { score, reasons } = compare(subject, c, correlation);
    return { ...c, score: Math.round(score * 100) / 100, strength: strength(score), reasons: reasons.slice(0, 3), correlation, sectorRank: sectorRank(c._id) };
  };
  const byScore = (a: RelatedItem, b: RelatedItem) => b.score - a.score || a.symbol.localeCompare(b.symbol) || a._id.localeCompare(b._id);
  const noSector = !subject.sector && !subject.industry;
  const peers = noSector ? [] : peerPool.map(build).sort(byScore).slice(0, LIMIT);
  const sizeItems = sizePool.map(build).sort(byScore).slice(0, LIMIT)
    // Across sectors an industry match cannot apply; lead with what does match.
    .map(item => ({ ...item, reasons: item.reasons.filter(r => r.key !== 'industry') }));
  const leaders = leaderPool.map(build)
    .map(item => ({ ...item, reasons: [{ key: 'leader', label: `#${item.sectorRank} in sector by market cap` }, ...item.reasons.filter(r => r.key !== 'size' && r.key !== 'band')].slice(0, 3) }));
  const sectorLabel = subject.industry && subject.sector && !same(subject.industry, subject.sector) ? `${subject.sector} · ${subject.industry}` : subject.sector ?? subject.industry;
  const bandText = subject.band ? subject.band.label.toLowerCase() : 'similar-size';
  const lenses: Lens[] = [
    { key: 'peers', label: 'Closest peers', items: peers,
      description: 'Same industry or sector, ranked by size, valuation, returns on capital, leverage, liquidity, index membership and — where stored history allows — how closely prices move together.',
      message: noSector ? 'Closest peers need a reported sector or industry for this company.' : peers.length ? null : `No other active ${current.exchange} companies in ${sectorLabel} have saved data yet.` },
    { key: 'size', label: subject.band ? `Other ${bandText}s` : 'Same size, other sectors', items: sizeItems,
      description: `${subject.band ? `Other ${bandText} companies` : 'Companies within 2× of this market cap'} outside ${sectorLabel ?? 'this sector'}, with the most similar financial profile. Useful for comparing businesses of the same scale or diversifying away from one sector.`,
      message: !subject.marketCap ? 'Size comparison needs a saved market cap for this company.' : sizeItems.length ? null : 'No other companies of this size have saved data yet.' },
    { key: 'leaders', label: 'Sector leaders', items: leaders,
      description: `The largest companies in ${sectorLabel ?? 'this sector'} by saved market cap — a benchmark for valuation and returns on capital.`,
      message: noSector ? 'Sector leaders need a reported sector or industry for this company.' : leaders.length ? null : `No other ${sectorLabel} companies have a saved market cap yet.` },
  ];
  return { subject: { ...subject, sectorRank: subject.marketCap && !noSector ? sectorRank(current._id) : null, sectorSize: noSector ? 0 : sectorPeers.length + 1 },
    sector: subject.sector, industry: subject.industry, rankedCompanies, lenses };
}
