import { randomUUID } from 'node:crypto';
import { instruments, sourceRuns, facts, storedCandles, latestFacts } from '../repository.js';
import { jobs } from '../../../shared/redis.js';
import { INDEX_SOURCES } from '../sources/index-membership.js';
import { ConnectionModel } from '../../connections/models/connection.model.js';
import type { ImportRequest } from '../validations/market-data.validation.js';
import { universeRefreshStatus } from './universe-refresh.service.js';

export async function dataStatus() {
  const [listings, companies, recentRuns, coverage, candles, dhan, universeRefresh] = await Promise.all([
    instruments.countDocuments({ active: true }), instruments.countDocuments({ active: true, primary: true }),
    sourceRuns.find().sort({ startedAt: -1 }).limit(20).lean(),
    facts.aggregate([{ $match: { knownAt: { $lte: new Date().toISOString() }, $or: [{ validUntil: { $gte: new Date().toISOString() } }, { validUntil: { $exists: false } }] } },
      { $group: { _id: { field: '$field', instrumentId: '$instrumentId' }, knownAt: { $max: '$knownAt' } } },
      { $group: { _id: '$_id.field', instruments: { $sum: 1 }, latestObservation: { $max: '$knownAt' } } }]),
    storedCandles.aggregate([{ $group: { _id: '$interval', count: { $sum: 1 }, from: { $min: '$time' }, to: { $max: '$time' } } }]),
    ConnectionModel.findById('dhan').select('+encryptedToken').lean(),
    universeRefreshStatus(),
  ]);
  const connected = dhan?.status === 'connected' && !!dhan.encryptedToken && !!dhan.expiresAt && Date.parse(dhan.expiresAt) > Date.now();
  return { listings, companies, recentRuns, coverage, candles, indices: INDEX_SOURCES, universeRefresh,
    dhan: { connected, expiresAt: dhan?.expiresAt, dataPlan: dhan?.dataPlan, apiConfigured: !!(process.env.DHAN_API_KEY && process.env.DHAN_API_SECRET && process.env.DHAN_CLIENT_ID),
      hasSavedToken: !!dhan?.encryptedToken || !!process.env.DHAN_ACCESS_TOKEN,
      tokenSource: dhan?.tokenSource ?? 'unknown', autoRenew: dhan?.autoRenew ?? false,
      renewalState: dhan?.renewalState ?? 'off', nextRenewalAt: dhan?.nextRenewalAt,
      lastRenewedAt: dhan?.lastRenewedAt, renewalError: dhan?.renewalError },
    limitations: ['Company metrics are snapshots from their collection date, not historical fundamentals.',
      'NSE/BSE pledge disclosures are matched by company identifiers; absent or stale disclosures are unknown, never zero.',
      'Index membership coverage is limited to the displayed imported index catalogue.',
      'Reported growth, news sentiment and proprietary chart patterns need additional verified sources or calculations.'] };
}
export async function queueImport(input: ImportRequest) {
  const id = randomUUID();
  const existing = await jobs.getJobs(['active', 'waiting', 'delayed']);
  const duplicate = existing.find(x => x.name === 'data-import' && JSON.stringify(x.data) === JSON.stringify(input));
  if (duplicate) return { id: duplicate.id, status: 'queued' };
  await jobs.add('data-import', input, { jobId: id });
  return { id, status: 'queued' };
}
export async function searchInstruments(query: string, exchange?: 'NSE' | 'BSE') {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return instruments.find({ active: true, ...(exchange ? { exchange } : {}), ...(escaped ? {
    $or: [{ symbol: { $regex: escaped, $options: 'i' } }, { name: { $regex: escaped, $options: 'i' } }, { isin: query }],
  } : { primary: true }) }).sort({ primary: -1, symbol: 1 }).limit(30).lean();
}
export async function instrumentDetail(id: string) {
  const [instrument, values] = await Promise.all([instruments.findById(id).lean(), latestFacts(id, new Date().toISOString())]);
  return { instrument, facts: values };
}
