import type { Fact, Instrument } from '../../market-data/types.js';
import type { StockQuote } from '../../stock-details/types.js';
import type { DiscoveryGroup, DiscoveryStock, Evidence, Metric, DiscoveryQuote } from '../types.js';

export const indianDate = (at: string) => new Date(Date.parse(at) + 19_800_000).toISOString().slice(0, 10);
export function discoveryEvidence(quote: DiscoveryQuote | undefined, facts: Fact[], sessionDate: string | undefined, at: string) {
  const values: Partial<Record<Metric, Evidence>> = {};
  for (const field of ['marketCap', 'roe', 'debtEquity'] as const) {
    const fact = facts.find(f => f.field === field);
    if (!fact || typeof fact.value !== 'number' || !Number.isFinite(fact.value) || fact.knownAt > at || (fact.validUntil && fact.validUntil < at)) continue;
    if (field === 'marketCap' && fact.value <= 0) continue;
    values[field] = { field, label: field === 'marketCap' ? 'Market cap' : field === 'roe' ? 'ROE' : 'Debt / equity', value: fact.value, unit: field === 'marketCap' ? '₹ Cr' : field === 'roe' ? '%' : '×', source: fact.source,
      observedAt: fact.observedAt, period: fact.period, statementBasis: fact.statementBasis };
  }
  // Quotes from another session (or missing a trade timestamp) cannot enter today's rankings.
  if (quote?.source === 'dhan-snapshot' && quote.lastTradeAt && Number.isFinite(Date.parse(quote.lastTradeAt)) && quote.lastTradeAt <= at && indianDate(quote.lastTradeAt) === sessionDate) {
    const add = (field: Metric, label: string, value: number | null, unit: string) => {
      if (value !== null && Number.isFinite(value)) values[field] = { field, label, value, unit, source: 'dhan-snapshot', observedAt: quote.receivedAt, period: sessionDate };
    };
    add('price', 'Snapshot price', quote.price, '₹'); add('percent', 'Session change', quote.percent, '%');
    if (values.percent && quote.changeSource === 'nse-bhavcopy') values.percent.source = 'Dhan snapshot / NSE daily report previous close';
    add('turnover', 'Estimated traded value', quote.volume !== null && quote.volume > 0 && quote.averagePrice !== null && quote.averagePrice > 0 ? quote.volume * quote.averagePrice / 10_000_000 : null, '₹ Cr');
    add('aboveVwap', 'Above session VWAP', quote.averagePrice !== null && quote.averagePrice > 0 ? (quote.price / quote.averagePrice - 1) * 100 : null, '%');
  }
  return values;
}
export function evaluateGroup(group: DiscoveryGroup, stocks: Instrument[], evidence: Map<string, Partial<Record<Metric, Evidence>>>, quotes: Map<string, StockQuote>) {
  const fields = [...new Set([...group.criteria.map(rule => rule.field), group.rankBy])];
  let available = 0;
  const items: DiscoveryStock[] = [];
  for (const stock of stocks) {
    const values = evidence.get(stock._id) ?? {};
    if (fields.some(field => !values[field])) continue;
    available++;
    if (!group.criteria.every(rule => { const n = values[rule.field]!.value; return rule.operator === '>' ? n > rule.value : rule.operator === '>=' ? n >= rule.value : rule.operator === '<' ? n < rule.value : n <= rule.value; })) continue;
    items.push({ _id: stock._id, symbol: stock.symbol, name: stock.name, isin: stock.isin, exchange: stock.exchange, active: stock.active,
      discovery: { rank: 0, checks: fields.map(field => values[field]!), ...(group.family === 'session' ? { quote: quotes.get(stock._id) } : {}) } });
  }
  items.sort((a, b) => (evidence.get(a._id)![group.rankBy]!.value - evidence.get(b._id)![group.rankBy]!.value) * (group.ascending ? 1 : -1) || a.symbol.localeCompare(b.symbol) || a._id.localeCompare(b._id));
  items.forEach((row, index) => { row.discovery.rank = index + 1; });
  return { items, coverage: { total: stocks.length, available, missing: stocks.length - available, matched: items.length } };
}
