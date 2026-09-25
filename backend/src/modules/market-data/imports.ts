import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { AppError, invariant } from '../../shared/errors.js';
import { announce } from '../../shared/redis.js';
import { jobContext } from '../../shared/job-context.js';
import { download, downloadJson } from '../../shared/http-client.js';
import { instruments, deliveryDays, sourceRuns, writeFacts } from './repository.js';
import { parseDhanMaster, DHAN_MASTER_URL } from './sources/dhan-master.js';
import { parseNseDelivery, monthlyDelivery, deliveryUrl, NSE_EQUITIES_URL, NSE_PLEDGE_URL, NSE_HOLIDAYS_URL, parseNsePledge, regularNseSessions } from './sources/nse-reports.js';
import { bseDeliveryUrl, parseBseDelivery, BSE_PLEDGE_URL, parseBsePledge } from './sources/bse-reports.js';
import { INDEX_SOURCES, parseBseMembers, parseNiftyMembers } from './sources/index-membership.js';
import type { Fact, SourceRun } from './types.js';
import { SourceArtifactModel } from './models/market-data.model.js';
import { motilalMasterUrl, parseMotilalMappings } from './sources/motilal-master.js';
import { publishInstrumentSnapshot } from './services/instrument-snapshot.service.js';
import { requestShareholding } from './providers/shareholding.client.js';

export type ImportKind = 'instruments' | 'memberships' | 'pledge' | 'delivery' | 'fundamentals' | 'history';
export type Progress = (processed: number, total?: number, details?: Record<string, unknown>) => Promise<void>;
export async function sourceRun(source: string, action: (progress: Progress, errors: SourceRun['failures']) => Promise<Record<string, unknown> | void>) {
  const run: SourceRun = { _id: jobContext.getStore()?.id ?? randomUUID(), source, status: 'running', startedAt: new Date().toISOString(), processed: 0, failures: [] };
  await sourceRuns.updateOne({ _id: run._id }, { $set: run, $unset: { finishedAt: 1, details: 1, total: 1 } }, { upsert: true });
  const progress: Progress = async (processed, total, details) => {
    await sourceRuns.updateOne({ _id: run._id }, { $set: { processed, ...(total !== undefined ? { total } : {}), ...(details ? { details } : {}) } });
    await announce('data.progress', { id: run._id, source, processed, total });
  };
  try {
    const details = await action(progress, run.failures);
    await sourceRuns.updateOne({ _id: run._id }, { $set: { status: run.failures.length ? 'partial' : 'completed', finishedAt: new Date().toISOString(), failures: run.failures.slice(0, 50), details: details ?? {} } });
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Import failed. Check source availability and the server configuration.';
    await sourceRuns.updateOne({ _id: run._id }, { $set: { status: 'failed', finishedAt: new Date().toISOString(), failures: [...run.failures, { item: source, message }].slice(0, 50) } });
    throw new AppError(502, 'IMPORT_FAILED', message);
  } finally { await announce('data.changed', { id: run._id }); }
  return run._id;
}
export async function syncInstruments() {
  return sourceRun('instruments', async progress => {
    const observedAt = new Date().toISOString();
    const rows = parseDhanMaster((await download(DHAN_MASTER_URL)).toString('utf8'), observedAt);
    await progress(0, rows.length);
    const stats = await publishInstrumentSnapshot(rows);
    await progress(rows.length, rows.length);
    return { ...stats, sourceUrl: DHAN_MASTER_URL };
  });
}
export async function syncMotilalMappings() {
  return sourceRun('motilal-mappings', async (progress, errors) => {
    const stocks = await instruments.find({ active: true }).lean(); invariant(stocks.length, 'Import the instrument master first');
    let matched = 0;
    for (const exchange of ['NSE', 'BSE'] as const) {
      try {
        const mappings = parseMotilalMappings((await download(motilalMasterUrl(exchange))).toString('utf8'), exchange, stocks);
        invariant(mappings.length, `Motilal ${exchange} master had no unambiguous matches`);
        // An old mapping is unavailable until confirmed against the current exchange master.
        await instruments.updateMany({ exchange }, { $unset: { motilalCode: 1 } });
        for (let i = 0; i < mappings.length; i += 500) await instruments.bulkWrite(mappings.slice(i, i + 500).map(x => ({ updateOne: { filter: { _id: x.id }, update: { $set: { motilalCode: x.code } } } })));
        matched += mappings.length; await progress(matched, stocks.length);
      } catch (error) { errors.push({ item: exchange, message: error instanceof AppError ? error.message : 'Motilal mapping unavailable' }); }
    }
    return { matched, listings: stocks.length };
  });
}
export async function syncMemberships() {
  return sourceRun('memberships', async (progress, errors) => {
    const stocks = await instruments.find({ active: true }).lean(); invariant(stocks.length, 'Import the instrument master first');
    const tags = new Map<string, Set<string>>(), industry = new Map<string, string>();
    const reports: { id: string; count: number; sourceUrl: string; period?: string }[] = [];
    for (const [i, source] of INDEX_SOURCES.entries()) {
      try {
        const raw = await download(source.url);
        const members = source.exchange === 'NSE' ? parseNiftyMembers(raw.toString('utf8')) : parseBseMembers(JSON.parse(raw.toString('utf8')));
        let matched = 0;
        for (const member of members) {
          const isin = member.isin ?? stocks.find(x => x.exchange === 'BSE' && x.securityId === member.securityId)?.isin;
          if (!isin) continue;
          tags.set(isin, new Set([...(tags.get(isin) ?? []), source.id]));
          if (member.industry) industry.set(isin, member.industry);
          matched++;
        }
        reports.push({ id: source.id, count: matched, sourceUrl: source.url, period: members[0]?.period });
      } catch (e) { errors.push({ item: source.id, message: e instanceof AppError ? e.message : 'Constituent format unavailable' }); }
      await progress(i + 1, INDEX_SOURCES.length);
      await pause(250);
    }
    // Do not publish partial lists as authoritative negative membership (IS NOT / NOT IN).
    invariant(!errors.length, 'Index import incomplete; previous membership snapshot is retained');
    const observedAt = new Date().toISOString();
    const rows: Fact[] = stocks.map(x => ({ _id: `index:${x._id}:${observedAt}`, instrumentId: x._id,
      field: 'index', value: [...tags.get(x.isin) ?? []], source: 'exchange-indices', sourceUrl: 'https://www.niftyindices.com/indices',
      observedAt, knownAt: observedAt, validUntil: new Date(Date.parse(observedAt) + 8 * 86400000).toISOString(), basis: 'observed-snapshot' }));
    await writeFacts(rows);
    return { indexedCompanies: tags.size, reports, coverage: INDEX_SOURCES.map(x => x.id), historical: false };
  });
}
export async function syncPledge() {
  return sourceRun('pledge', async (progress, errors) => {
    const stocks = await instruments.find({ active: true }).lean();
    invariant(stocks.length, 'Import the instrument master first');
    let reported = 0, unmatched = 0, written = 0;
    for (const exchange of ['NSE', 'BSE']) {
      try {
        const result = exchange === 'NSE'
          ? parseNsePledge(await downloadJson(NSE_PLEDGE_URL), (await download(NSE_EQUITIES_URL)).toString('utf8'), stocks, new Date().toISOString())
          : parseBsePledge(await requestShareholding(BSE_PLEDGE_URL), stocks, new Date().toISOString());
        await writeFacts(result.facts); reported += result.reported; unmatched += result.unmatched; written += result.facts.length;
      } catch (e) { errors.push({ item: exchange, message: e instanceof AppError ? e.message : 'Pledge disclosures unavailable' }); }
    }
    invariant(written > 0, 'No pledge disclosures could be imported');
    await progress(written, written);
    return { reportedCompanies: reported, matchedListingObservations: written, unmatchedCompanies: unmatched,
      definition: 'Quarterly encumbered promoter shares / total promoter holding (%)', missingIsZero: false };
  });
}
export async function syncDelivery(month: string, exchange: 'NSE' | 'BSE' = 'NSE') {
  return sourceRun(`${exchange.toLowerCase()}-delivery`, async (progress, errors) => {
    const now = new Date().toISOString();
    invariant(month < new Date(Date.now() + 19800000).toISOString().slice(0, 7), 'Monthly data must use a completed month');
    const [calendar, stocks] = await Promise.all([downloadJson(NSE_HOLIDAYS_URL), instruments.find({ active: true, exchange }).lean()]);
    invariant(stocks.length, 'Import the instrument master first');
    const regular = regularNseSessions(calendar, month);
    const [y, m] = month.split('-').map(Number);
    const allDates = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    const available: string[] = [];
    for (const [i, date] of allDates.entries()) {
      try {
        const receiptId = `${exchange}:delivery:${date}`;
        const receipt = await SourceArtifactModel.findById(receiptId).lean();
        if (receipt) { available.push(date); await progress(i + 1, allDates.length); continue; }
        const url = exchange === 'NSE' ? deliveryUrl(date) : bseDeliveryUrl(date);
        const raw = (await download(url)).toString('utf8');
        const rows = exchange === 'NSE' ? parseNseDelivery(raw, date, stocks, now) : parseBseDelivery(raw, date, stocks, now);
        for (let n = 0; n < rows.length; n += 500) await deliveryDays.bulkWrite(rows.slice(n, n + 500).map(x => ({ updateOne: { filter: { _id: x._id }, update: { $setOnInsert: x }, upsert: true } })));
        await SourceArtifactModel.updateOne({ _id: receiptId }, { $setOnInsert: { source: exchange, date,
          checksum: createHash('sha256').update(raw).digest('hex'), rowCount: rows.length, observedAt: now } }, { upsert: true });
        available.push(date);
      } catch (e) {
        // Probe weekends/holidays too, so special sessions are included when published.
        const closedDayNoReport = !regular.includes(date) && e instanceof AppError
          && (e.code === 'SOURCE_HTTP_404' || e.message.includes('contains a different trading date') || e.message.includes('contains a different date'));
        if (!closedDayNoReport) errors.push({ item: date, message: e instanceof AppError ? e.message : 'Report format unavailable' });
      }
      await progress(i + 1, allDates.length); await pause(250);
    }
    invariant(!errors.length && regular.every(d => available.includes(d)), 'Incomplete monthly delivery reports; monthly metrics were not published');
    const days = await deliveryDays.find({ instrumentId: { $in: stocks.map(x => x._id) }, date: { $gte: `${month}-01`, $lte: `${month}-31` } }).lean();
    const rows = monthlyDelivery(days, month, available, now).map(x => ({ ...x, source: `${exchange.toLowerCase()}-monthly-delivery`,
      _id: `${exchange.toLowerCase()}:${x._id}`, sourceUrl: exchange === 'NSE' ? x.sourceUrl : 'https://www.bseindia.com/markets/equity/EQReports/GrossShortPos.aspx' }));
    await writeFacts(rows);
    return { month, exchange, sessions: available, facts: rows.length, definition: 'Sum of delivered shares / sum of traded shares; actual exchange turnover' };
  });
}
