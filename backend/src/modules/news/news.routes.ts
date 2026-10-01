import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { maintenance } from '../../shared/redis.js';
import { instruments, sourceRuns } from '../market-data/repository.js';
import { instrumentIdSchema } from '../market-data/validations/market-data.validation.js';
import { marketEvents } from '../stock-details/services/research-feeds.service.js';
import { MonthlyUniverseModel } from '../qualification/models/qualification.model.js';
import { currentMonth } from '../qualification/services/universe.service.js';
import { WatchlistModel } from '../watchlists/models/watchlist.model.js';
import { NewsItemModel } from './news.model.js';
import { companyNews, newsAggregates } from './news.service.js';
import { NEWS_SOURCES } from './sources.js';
import { EVENT_TYPES } from './classifier.js';

export const newsRouter = Router();
const DAY = 86_400_000;
const query = z.object({
  scope: z.enum(['all', 'following', 'stock']).default('all'), instrumentId: instrumentIdSchema.optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(), eventType: z.enum(EVENT_TYPES as [string, ...string[]]).optional(),
  kind: z.enum(['important', 'news', 'filing']).optional(), publisher: z.string().max(80).optional(), q: z.string().max(120).optional(),
  linked: z.enum(['true', 'false']).optional(), days: z.coerce.number().int().min(1).max(90).default(7),
  page: z.coerce.number().int().min(1).max(200).default(1), pageSize: z.coerce.number().int().min(5).max(100).default(30),
});
async function followedIsins() {
  const [universe, lists] = await Promise.all([MonthlyUniverseModel.findById(currentMonth()).select('members').lean(), WatchlistModel.find({ archivedAt: { $exists: false } }).select('ids').lean()]);
  const ids = [...new Set([...(universe?.members ?? []).map(m => m.instrumentId), ...lists.flatMap(l => l.ids)])];
  return (await instruments.distinct('isin', { _id: { $in: ids } })) as string[];
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
newsRouter.get('/', async (req, res) => {
  const input = query.parse(req.query), now = new Date().toISOString();
  const filter: Record<string, unknown> = { publishedAt: { $gte: new Date(Date.now() - input.days * DAY).toISOString(), $lte: now }, knownAt: { $lte: now } };
  if (input.scope === 'stock') {
    if (!input.instrumentId) throw new AppError(422, 'STOCK_REQUIRED', 'Choose a stock');
    const stock = await instruments.findById(input.instrumentId).select('isin').lean(); if (!stock) throw new AppError(404, 'STOCK_NOT_FOUND', 'Stock not found');
    filter.isins = stock.isin;
  } else if (input.scope === 'following') filter.isins = { $in: await followedIsins() };
  else if (input.linked === 'true') filter.isins = { $exists: true, $ne: [] };
  if (input.sentiment) filter['sentiment.label'] = input.sentiment;
  if (input.eventType) filter['sentiment.eventType'] = input.eventType;
  const and: Record<string, unknown>[] = [];
  // Media news plus only the filings that carry a direction; routine filings stay available under 'filing'.
  if (input.kind === 'important') and.push({ $or: [{ kind: 'news' }, { 'sentiment.label': { $ne: 'neutral' } }] });
  else if (input.kind) filter.kind = input.kind;
  if (input.publisher) filter.publisher = input.publisher;
  if (input.q) and.push({ $or: [{ title: { $regex: escape(input.q), $options: 'i' } }, { 'companies.symbol': input.q.toUpperCase() }] });
  if (and.length) filter.$and = and;
  const [items, total] = await Promise.all([
    NewsItemModel.find(filter).sort({ publishedAt: -1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean(),
    NewsItemModel.countDocuments(filter),
  ]);
  res.json({ items, total, page: input.page, pageSize: input.pageSize });
});
/** One company's coverage: aggregates plus its latest stories. Fetches the company's own search on demand. */
newsRouter.get('/stock/:id', async (req, res) => {
  const stock = await instruments.findById(instrumentIdSchema.parse(req.params.id)).select('isin symbol name').lean();
  if (!stock) throw new AppError(404, 'STOCK_NOT_FOUND', 'Stock not found');
  const refresh = z.enum(['true', 'false']).optional().parse(req.query.refresh) === 'true';
  let message: string | undefined;
  // A short, bounded wait: the page still answers with stored coverage if the search is slow.
  try { await Promise.race([companyNews({ isin: stock.isin, symbol: stock.symbol, name: stock.name ?? stock.symbol }, refresh), new Promise(resolve => setTimeout(resolve, 6000))]); }
  catch { message = 'Company news search could not be refreshed. Stored stories are shown.'; }
  const now = Date.now();
  const items = await NewsItemModel.find({ isins: stock.isin, publishedAt: { $gte: new Date(now - 30 * DAY).toISOString(), $lte: new Date(now).toISOString() } }).sort({ publishedAt: -1 }).limit(200).lean();
  res.json({ summary: newsAggregates(items, stock.isin, now), items: items.slice(0, 60), checkedAt: new Date(now).toISOString(), message });
});
/** Companies with the most positive/negative coverage, at least two stories in the window. */
newsRouter.get('/movers', async (req, res) => {
  const days = z.coerce.number().int().min(1).max(30).default(7).parse(req.query.days), now = Date.now();
  const rows = await NewsItemModel.aggregate<{ _id: string; symbol: string; name: string; stories: number; score: number; positive: number; negative: number }>([
    { $match: { publishedAt: { $gte: new Date(now - days * DAY).toISOString(), $lte: new Date(now).toISOString() } } },
    { $unwind: '$companies' }, { $match: { 'companies.confidence': { $gte: 0.6 } } },
    { $set: { impact: { $ifNull: ['$companies.sentiment', '$sentiment.score'] } } },
    { $match: { $or: [{ kind: 'news' }, { impact: { $gte: 0.2 } }, { impact: { $lte: -0.2 } }] } },
    { $group: { _id: '$companies.isin', symbol: { $first: '$companies.symbol' }, name: { $first: '$companies.name' }, keys: { $addToSet: '$titleKey' },
      weighted: { $sum: { $multiply: ['$impact', '$sentiment.confidence'] } }, weight: { $sum: '$sentiment.confidence' },
      positive: { $sum: { $cond: [{ $gte: ['$impact', 0.25] }, 1, 0] } }, negative: { $sum: { $cond: [{ $lte: ['$impact', -0.25] }, 1, 0] } } } },
    { $set: { stories: { $size: '$keys' }, score: { $round: [{ $multiply: [100, { $divide: ['$weighted', { $max: ['$weight', 0.01] }] }] }, 0] } } },
    { $match: { stories: { $gte: 2 } } }, { $project: { keys: 0, weighted: 0, weight: 0 } },
  ]);
  const listings = await instruments.find({ isin: { $in: rows.map(r => r._id) }, active: true, primary: true }).select('_id isin symbol name exchange').lean();
  const withListing = rows.flatMap(r => { const l = listings.find(x => x.isin === r._id); return l ? [{ ...r, instrumentId: l._id, exchange: l.exchange, isin: r._id }] : []; });
  res.json({ days, positive: withListing.filter(r => r.score > 0).sort((a, b) => b.score - a.score || b.stories - a.stories).slice(0, 10),
    negative: withListing.filter(r => r.score < 0).sort((a, b) => a.score - b.score || b.stories - a.stories).slice(0, 10) });
});
newsRouter.get('/sources', async (_req, res) => {
  const [last, stats] = await Promise.all([
    sourceRuns.findOne({ source: 'news' }).sort({ startedAt: -1 }).lean(),
    NewsItemModel.aggregate<{ _id: string; stories: number; latest: string }>([{ $match: { publishedAt: { $gte: new Date(Date.now() - DAY).toISOString() } } }, { $group: { _id: '$publisher', stories: { $sum: 1 }, latest: { $max: '$publishedAt' } } }, { $sort: { stories: -1 } }]),
  ]);
  res.json({ sources: [...new Set(NEWS_SOURCES.map(s => s.name))].concat('NSE filing', 'Google News (per company)'), last24h: stats,
    lastRun: last ? { status: last.status, startedAt: last.startedAt, finishedAt: last.finishedAt, failures: last.failures.slice(0, 10), details: last.details } : null });
});
newsRouter.post('/refresh', async (_req, res) => {
  await maintenance.add('news', {}, { jobId: `news-manual-${Math.floor(Date.now() / 120_000)}` });
  res.status(202).json({ status: 'queued' });
});
newsRouter.get('/events', async (req, res) => {
  res.json(await marketEvents(z.enum(['NSE', 'BSE']).default('NSE').parse(req.query.exchange)));
});
