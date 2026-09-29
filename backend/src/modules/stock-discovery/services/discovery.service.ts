import { z } from 'zod';
import { AppError } from '../../../shared/errors.js';
import { marketSession } from '../../../shared/market-calendar.js';
import { InstrumentModel, FactModel } from '../../market-data/models/market-data.model.js';
import type { Fact, Instrument } from '../../market-data/types.js';
import { discoveryGroups } from '../config/groups.js';
import { discoveryEvidence, evaluateGroup } from './evaluate.js';
import { discoverySnapshot } from './snapshot.service.js';
import { discoverySession } from '../utils/session.js';
import type { QuoteSnapshot } from '../types.js';

const discoveryQuery = z.object({ exchange: z.enum(['NSE', 'BSE']).optional(), refresh: z.enum(['1']).optional() });
const stocksQuery = discoveryQuery.extend({ group: z.string().max(30), q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().refine(n => [10, 20, 50, 100].includes(n)).default(20), sort: z.enum(['rank', 'symbol', 'exchange']).default('rank'), order: z.enum(['asc', 'desc']).default('asc') });

let cached: { until: number; value: { stocks: Instrument[]; facts: Fact[]; at: string } } | undefined;
let reading: Promise<{ stocks: Instrument[]; facts: Fact[]; at: string }> | undefined;
async function companyData() {
  if (cached && cached.until > Date.now()) return cached.value;
  if (reading) return reading;
  reading = (async () => {
    const at = new Date().toISOString();
    const [stocks, facts] = await Promise.all([
      InstrumentModel.find({ active: true }).lean(),
      FactModel.aggregate<Fact>([
        { $match: { field: { $in: ['marketCap', 'roe', 'debtEquity'] }, knownAt: { $lte: at }, $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: at } }] } },
        { $set: { sourcePriority: { $cond: [{ $eq: ['$source', 'dhan-public-company'] }, 0, 1] } } },
        { $sort: { sourcePriority: -1, period: -1, knownAt: -1, _id: 1 } },
        { $group: { _id: { instrument: '$instrumentId', field: '$field' }, fact: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$fact' } }, { $unset: 'sourcePriority' },
      ]),
    ]);
    const value = { stocks, facts, at }; cached = { until: Date.now() + 60_000, value }; return value;
  })().finally(() => { reading = undefined; });
  return reading;
}
export function prepareDiscovery(stocks: Instrument[], facts: Fact[], snapshot: QuoteSnapshot | null, at: string, exchange?: 'NSE' | 'BSE') {
  const selected = stocks.filter(stock => stock.active && (!exchange || stock.exchange === exchange));
  const quotes = new Map((snapshot?.quotes ?? []).map(quote => [quote.instrumentId, quote]));
  const byStock = new Map<string, Fact[]>();
  for (const fact of facts) { const values = byStock.get(fact.instrumentId) ?? []; values.push(fact); byStock.set(fact.instrumentId, values); }
  const evidence = new Map(selected.map(stock => [stock._id, discoveryEvidence(quotes.get(stock._id), byStock.get(stock._id) ?? [], snapshot?.sessionDate, at)]));
  return { selected, quotes, evidence };
}
async function context(exchange?: 'NSE' | 'BSE', explicit = false) {
  const [company, { snapshot, refreshing }] = await Promise.all([companyData(), discoverySnapshot(explicit)]);
  const prepared = prepareDiscovery(company.stocks, company.facts, snapshot, new Date().toISOString(), exchange);
  return { ...prepared, snapshot, refreshing, factsCheckedAt: company.at };
}
export async function discoveryCatalog(raw: unknown) {
  const input = discoveryQuery.parse(raw), ctx = await context(input.exchange, input.refresh === '1');
  const market = marketSession(), session = discoverySession();
  return { groups: discoveryGroups.map(group => ({ ...group, coverage: evaluateGroup(group, ctx.selected, ctx.evidence, ctx.quotes).coverage })),
    refreshing: ctx.refreshing, market, sessionDate: ctx.snapshot?.sessionDate ?? null,
    capturedAt: ctx.snapshot?.completedAt ?? null, captureStartedAt: ctx.snapshot?.startedAt ?? null, factsCheckedAt: ctx.factsCheckedAt,
    stale: !!ctx.snapshot?.completedAt && (ctx.snapshot.sessionDate !== session?.date || (market.open && Date.now() - Date.parse(ctx.snapshot.completedAt) > 300_000)),
    warning: ctx.snapshot?.warning || null,
    version: `${ctx.snapshot?.completedAt ?? ''}:${ctx.factsCheckedAt}` };
}
export async function discoverStocks(raw: unknown) {
  const input = stocksQuery.parse(raw), group = discoveryGroups.find(g => g.id === input.group);
  if (!group) throw new AppError(422, 'DISCOVERY_GROUP', 'Choose a supported discovery group.');
  const ctx = await context(input.exchange), result = evaluateGroup(group, ctx.selected, ctx.evidence, ctx.quotes);
  const query = input.q.toLowerCase();
  const rows = result.items.filter(stock => !query || [stock.symbol, stock.name, stock.isin].some(value => value.toLowerCase().includes(query)));
  if (input.sort !== 'rank') { const field = input.sort; rows.sort((a, b) => a[field].localeCompare(b[field]) * (input.order === 'asc' ? 1 : -1) || a._id.localeCompare(b._id)); }
  const total = rows.length, page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
  return { items: rows.slice((page - 1) * input.pageSize, page * input.pageSize), total, page, pageSize: input.pageSize, coverage: result.coverage,
    capturedAt: ctx.snapshot?.completedAt ?? null, sessionDate: ctx.snapshot?.sessionDate ?? null, group };
}
