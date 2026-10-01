import { setTimeout as pause } from 'node:timers/promises';
import { AppError } from '../../shared/errors.js';
import { download } from '../../shared/http-client.js';
import { redis } from '../../shared/redis.js';
import { facts, instruments } from '../market-data/repository.js';
import { sourceRun } from '../market-data/imports.js';
import type { Fact } from '../market-data/types.js';
import { MonthlyUniverseModel } from '../qualification/models/qualification.model.js';
import { currentMonth } from '../qualification/services/universe.service.js';
import { WatchlistModel } from '../watchlists/models/watchlist.model.js';
import { NEWS_SOURCES, NSE_ANNOUNCEMENTS, googleNewsUrl } from './sources.js';
import { headlineId, parseNseAnnouncements, parseRss, titleKey, type RawHeadline } from './parsers.js';
import { buildAliasIndex, linkCompanies, resolveNames, type AliasIndex, type Company } from './linker.js';
import { labelOf, lexiconScore } from './lexicon.js';
import { aiConfigured, aiModel, classifyBatch } from './classifier.js';
import { NewsItemModel, type NewsCompany, type NewsItem } from './news.model.js';
import { NEWS_FIELDS, newsAggregates } from './aggregates.js';
export { NEWS_FIELDS, newsAggregates } from './aggregates.js';

const DAY = 86_400_000;
/** Routine filings carry no price-relevant information; they are stored but never sent to the AI. */
const ROUTINE = /shareholders meeting|trading window|newspaper publication|registrar|copy of|investor (meet|presentation)|analysts?\/institutional|loss of share|duplicate share|certificate|compliance|book closure|record date|agm|e-?voting|postal ballot|closure of trading/i;

let indexCache: { at: number; index: AliasIndex; bySymbol: Map<string, Company>; byIsin: Map<string, Company> } | undefined;
async function companyIndex() {
  if (indexCache && Date.now() - indexCache.at < 3600_000) return indexCache;
  const rows = await instruments.find({ active: true, primary: true }).select('isin symbol name').lean();
  const companies = rows.map(r => ({ isin: r.isin, symbol: r.symbol, name: r.name ?? r.symbol }));
  indexCache = { at: Date.now(), index: buildAliasIndex(companies), bySymbol: new Map(companies.map(c => [c.symbol, c])), byIsin: new Map(companies.map(c => [c.isin, c])) };
  return indexCache;
}

async function fetchText(url: string) {
  const host = new URL(url).hostname, deadline = Date.now() + 20_000;
  // One request per host at a time, at most one per 1.5 s: polite to every publisher.
  while (!await redis.set(`quantforge:news:host:${host}`, '1', 'PX', 1500, 'NX')) {
    if (Date.now() > deadline) throw new AppError(503, 'NEWS_BUSY', `${host} is busy`);
    await pause(200);
  }
  return (await download(url, { timeout: 20_000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QuantForge/0.1', Accept: 'application/rss+xml, application/xml, text/xml, application/json, */*',
    ...(host.endsWith('nseindia.com') ? { Referer: 'https://www.nseindia.com/' } : {}) } }, 15_000_000)).toString('utf8');
}

/** Stores new headlines once; a story seen again from another feed only gains a source. */
export async function storeHeadlines(rows: RawHeadline[], sourceId: string, kind: NewsItem['kind'], focus?: Company) {
  const { index, bySymbol, byIsin } = await companyIndex();
  const now = new Date().toISOString(), since = new Date(Date.now() - 3 * DAY).toISOString();
  let added = 0;
  for (const row of rows) {
    const id = headlineId(row.url), key = titleKey(row.title);
    const existing = await NewsItemModel.findOne({ $or: [{ _id: id }, { titleKey: key, publishedAt: { $gte: since } }] }).select('_id companies').lean();
    if (existing) {
      // A per-company search confirms the company link even when the generic linker missed it.
      const confirm = focus && !existing.companies.some(c => c.isin === focus.isin) ? { $push: { companies: { ...focus, confidence: 0.7, method: 'name' as const } }, $addToSet: { sourceIds: sourceId, isins: focus.isin } } : { $addToSet: { sourceIds: sourceId } };
      await NewsItemModel.updateOne({ _id: existing._id }, confirm); continue;
    }
    let companies: NewsCompany[];
    if (kind === 'filing') {
      const company = (row.isin && byIsin.get(row.isin)) || (row.symbol && bySymbol.get(row.symbol));
      companies = company ? [{ ...company, confidence: 1, method: 'filing' }] : [];
    } else companies = linkCompanies(index, row.title, row.summary);
    if (focus && !companies.some(c => c.isin === focus.isin)) {
      // Google's per-company search often matches only the body text; keep it when the headline does not name another company.
      if (!companies.length) companies.push({ ...focus, confidence: 0.6, method: 'name' });
    }
    const score = lexiconScore(row.title, row.summary, row.category);
    // AI capacity goes to recent stories about a company; routine filings and unlinked stories keep their keyword score.
    const routine = kind === 'filing' && ROUTINE.test(row.category ?? '') || !companies.length || Date.parse(row.publishedAt) < Date.now() - 2 * DAY;
    await NewsItemModel.updateOne({ _id: id }, { $setOnInsert: {
      _id: id, titleKey: key, kind, title: row.title, summary: row.summary, url: row.url, publisher: row.publisher, sourceIds: [sourceId], category: row.category,
      publishedAt: row.publishedAt, knownAt: now, companies, isins: companies.map(c => c.isin),
      sentiment: { ...score, method: 'lexicon', scoredAt: now }, aiStatus: routine || !aiConfigured() ? 'skipped' : 'pending', aiAttempts: 0,
    } }, { upsert: true });
    added++;
  }
  return added;
}

/** AI scoring in batches of 25; quota errors stop the run and the rest keep their keyword score. */
export async function classifyPending(maxBatches = 8, dependencies = { classify: classifyBatch }) {
  if (!aiConfigured()) return { classified: 0, stopped: 'AI not configured' };
  const { index } = await companyIndex();
  let classified = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const pending = await NewsItemModel.find({ aiStatus: 'pending', publishedAt: { $gte: new Date(Date.now() - 7 * DAY).toISOString() } }).sort({ publishedAt: -1 }).limit(25).lean();
    if (!pending.length) break;
    let results;
    try { results = await dependencies.classify(pending.map(x => ({ id: x._id, title: x.title, summary: x.summary, publisher: x.publisher, category: x.category, companies: x.companies.map(c => c.name) }))); }
    catch (error) {
      if (error instanceof AppError && ['AI_QUOTA', 'AI_CREDENTIALS', 'AI_MODEL', 'AI_NOT_CONFIGURED'].includes(error.code)) return { classified, stopped: error.message };
      await NewsItemModel.updateMany({ _id: { $in: pending.map(x => x._id) } }, { $inc: { aiAttempts: 1 } });
      await NewsItemModel.updateMany({ _id: { $in: pending.map(x => x._id) }, aiAttempts: { $gte: 3 } }, { $set: { aiStatus: 'failed' } });
      continue;
    }
    const byId = new Map(results.map(r => [r.id, r])), now = new Date().toISOString();
    for (const item of pending) {
      const result = byId.get(item._id);
      if (!result) { await NewsItemModel.updateOne({ _id: item._id }, { $inc: { aiAttempts: 1 }, ...(item.aiAttempts >= 2 ? { $set: { aiStatus: 'failed' } } : {}) }); continue; }
      const companies = [...item.companies];
      // Names the AI found are resolved only through the exact alias index (no fuzzy matching).
      for (const match of resolveNames(index, result.companies.map(c => c.name))) if (!companies.some(c => c.isin === match.isin)) companies.push(match);
      const scored = companies.map(company => {
        const named = result.companies.find(c => resolveNames(index, [c.name]).some(m => m.isin === company.isin));
        return { ...company, ...(named ? { sentiment: named.score } : {}) };
      });
      await NewsItemModel.updateOne({ _id: item._id }, { $set: { companies: scored, isins: scored.map(c => c.isin), aiStatus: 'done',
        sentiment: { score: result.score, label: labelOf(result.score), confidence: result.confidence, method: 'ai', eventType: result.eventType, reason: result.reason || 'AI classification', model: aiModel(), scoredAt: now } } });
      classified++;
    }
    await pause(4000);
  }
  return { classified };
}

/** Companies the user follows: published qualified list and watchlists. */
async function focusCompanies(limit: number) {
  const [universe, lists] = await Promise.all([MonthlyUniverseModel.findById(currentMonth()).select('members').lean(), WatchlistModel.find({ archivedAt: { $exists: false } }).select('ids').lean()]);
  const ids = [...new Set([...(universe?.members ?? []).map(m => m.instrumentId), ...lists.flatMap(l => l.ids)])];
  const rows = await instruments.find({ _id: { $in: ids }, active: true }).select('isin symbol name').lean();
  return [...new Map(rows.map(r => [r.isin, { isin: r.isin, symbol: r.symbol, name: r.name ?? r.symbol }])).values()].slice(0, limit);
}
const companyQuery = (c: Company) => `"${c.name.replace(/\b(limited|ltd\.?)\b/gi, '').replace(/\s+/g, ' ').trim()}" (share OR stock OR shares OR results)`;
/** Google News search for one company, at most every two hours (or on demand when a stock is opened). */
export async function companyNews(company: Company, force = false) {
  const key = `quantforge:news:company:${company.isin}`;
  if (!force && await redis.exists(key)) return 0;
  await redis.set(key, '1', 'EX', force ? 1800 : 7200);
  const recent = Date.now() - 30 * DAY;
  const rows = parseRss(await fetchText(googleNewsUrl(companyQuery(company))), 'Google News').filter(r => Date.parse(r.publishedAt) >= recent).slice(0, 40);
  return storeHeadlines(rows, 'google-news', 'news', company);
}

const istDay = (at: number) => new Date(at + 19_800_000).toISOString().slice(0, 10);
export async function syncNews(options: { companies?: number; classify?: number } = {}) {
  return sourceRun('news', async (progress, errors) => {
    const counts: Record<string, number> = {};
    const steps = NEWS_SOURCES.length + 2 + 1;
    let step = 0;
    for (const source of NEWS_SOURCES) {
      try { counts[source.id] = await storeHeadlines(parseRss(await fetchText(source.url), source.name), source.id, 'news'); }
      catch (error) { errors.push({ item: source.name, message: error instanceof AppError ? error.message : 'Feed unavailable' }); }
      await progress(++step, steps);
    }
    for (const at of [Date.now() - DAY, Date.now()]) {
      const day = istDay(at).split('-').reverse().join('-');
      try { counts[`nse-${day}`] = await storeHeadlines(parseNseAnnouncements(JSON.parse(await fetchText(NSE_ANNOUNCEMENTS(day)))), 'nse-announcements', 'filing'); }
      catch (error) { errors.push({ item: `NSE filings ${day}`, message: error instanceof AppError ? error.message : 'NSE announcements unavailable' }); }
      await progress(++step, steps);
    }
    let companyStories = 0, companyErrors = 0;
    for (const company of await focusCompanies(options.companies ?? 60)) {
      try { companyStories += await companyNews(company); } catch { companyErrors++; }
    }
    if (companyErrors) errors.push({ item: 'Google News', message: `${companyErrors} company searches failed; they retry next run.` });
    const ai = await classifyPending(options.classify ?? 4);
    const written = await computeNewsFacts();
    await progress(steps, steps);
    // Headlines are kept for 400 days, enough for a year of monthly backtests.
    const pruned = await NewsItemModel.deleteMany({ publishedAt: { $lt: new Date(Date.now() - 400 * DAY).toISOString() } });
    return { added: counts, companyStories, ai, factsWritten: written, pruned: pruned.deletedCount };
  });
}

/**
 * Daily per-company news facts for rules. Values are dated when computed (never backdated); a company
 * with no linked stories gets explicit zero counts and "No coverage" so "no negative news" rules work.
 */
export async function computeNewsFacts(now = Date.now()) {
  const at = new Date(now).toISOString(), day = istDay(now);
  const listings = await instruments.find({ active: true }).select('_id isin').lean();
  const items = await NewsItemModel.find({ publishedAt: { $gte: new Date(now - 31 * DAY).toISOString(), $lte: at }, knownAt: { $lte: at }, isins: { $exists: true, $ne: [] } })
    .select('sentiment kind publishedAt titleKey companies isins').sort({ publishedAt: -1 }).lean();
  const byIsin = new Map<string, typeof items>();
  for (const item of items) for (const isin of item.isins) { const list = byIsin.get(isin) ?? []; list.push(item); byIsin.set(isin, list); }
  const rows: Fact[] = [];
  // Only listings whose values changed since the last write today are rewritten.
  const fingerprintKey = `quantforge:news:facts:${day}`;
  const previous = await redis.hgetall(fingerprintKey).catch(() => ({} as Record<string, string>));
  const fingerprints: Record<string, string> = {}, cleared: string[] = [];
  for (const listing of listings) {
    const values = newsAggregates(byIsin.get(listing.isin) ?? [], listing.isin, now);
    const fingerprint = JSON.stringify(values);
    if (previous[listing._id] === fingerprint) continue;
    fingerprints[listing._id] = fingerprint;
    for (const field of NEWS_FIELDS) {
      const value = values[field];
      if (value === null) { cleared.push(`news:${listing._id}:${field}:${day}`); continue; }
      rows.push({ _id: `news:${listing._id}:${field}:${day}`, instrumentId: listing._id, field, value, source: 'news-aggregate', sourceUrl: '/market-data/news',
        observedAt: at, knownAt: at, period: day, validUntil: new Date(now + 30 * 3600_000).toISOString(), basis: 'derived' });
    }
  }
  // One computation per day per listing; later runs the same day refresh it in place.
  for (let i = 0; i < rows.length; i += 1000) await facts.bulkWrite(rows.slice(i, i + 1000).map(row => ({ replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true } })));
  // A value that disappeared today (e.g. no stories left in the window) must not linger as today's fact.
  for (let i = 0; i < cleared.length; i += 5000) await facts.deleteMany({ _id: { $in: cleared.slice(i, i + 5000) } });
  if (Object.keys(fingerprints).length) await redis.multi().hset(fingerprintKey, fingerprints).expire(fingerprintKey, 2 * 86400).exec().catch(() => undefined);
  // Keep 35 days of daily values plus each month's last value, which monthly rules and backtests use.
  const cutoff = istDay(now - 35 * DAY);
  const monthEnds = await facts.aggregate<{ _id: string; last: string }>([{ $match: { source: 'news-aggregate', period: { $lt: cutoff } } }, { $group: { _id: { $substrCP: ['$period', 0, 7] }, last: { $max: '$period' } } }]);
  await facts.deleteMany({ source: 'news-aggregate', period: { $lt: cutoff, $nin: monthEnds.map(m => m.last) } });
  return rows.length;
}
