import { dhanRequest } from '../../connections/services/dhan.service.js';
import { facts, instruments, storedCandles, writeFacts } from '../repository.js';
import { parseDhanCompany } from '../sources/dhan-company.js';
import { downloadDailyWindows } from './daily-history-download.js';
import { DatasetReceiptModel } from '../models/dataset-receipt.model.js';
import type { Instrument } from '../types.js';
import { isClosedHistoryRange, missingHistoryRanges } from './history-coverage.js';
import { CALENDAR_SOURCE } from '../../../shared/market-calendar.js';
import { ensureDhanPublicCompany } from './dhan-public-company.service.js';

const companyRefreshMs = 7 * 86400000;
export function reuseCompanySnapshot(receipt: { checkedAt?: string | null; fields?: string[] } | null, requested: string[], available: string[], now = Date.now()) {
  if (requested.every(field => available.includes(field))) return true;
  // Successful company responses are snapshots. Retry absent metrics weekly,
  // not on every scan/day. Previously supplied but expired facts must refresh.
  return !!receipt?.checkedAt && Date.parse(receipt.checkedAt) > now - companyRefreshMs
    && requested.filter(field => !available.includes(field)).every(field => !receipt.fields?.includes(field));
}

export async function ensureCompanyData(stock: Instrument, fields: string[], month: string, options: { maxWaitMs?: number } = {}, dependencies = { request: dhanRequest, fallback: ensureDhanPublicCompany }) {
  if (!fields.length) return false;
  const now = new Date().toISOString();
  const available = await facts.distinct('field', { instrumentId: stock._id, field: { $in: fields }, knownAt: { $lte: now }, validUntil: { $gte: now } });
  if (fields.every(field => available.includes(field))) return false;
  const id = `company:${stock._id}:${month}`;
  const receipt = await DatasetReceiptModel.findById(id).lean();
  let downloaded = false;
  let officialError: unknown;
  if (!reuseCompanySnapshot(receipt, fields, available)) {
    try {
      const data = await dependencies.request('/data/companyinfo', { securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY', metrics: ['CO', 'RATIOS', 'SHP'] }, options);
      const at = new Date().toISOString(), rows = parseDhanCompany(data, stock, at);
      const listings = await instruments.find({ isin: stock.isin, active: true }).select('_id').lean();
      await writeFacts(listings.flatMap(listing => rows.map(row => ({ ...row, _id: `dhan:${listing._id}:${row.field}:${at}`, instrumentId: listing._id }))));
      await DatasetReceiptModel.updateOne({ _id: id }, { $set: { instrumentId: stock._id, kind: 'company', checkedAt: at, records: rows.length, fields: rows.map(x => x.field) } }, { upsert: true });
      downloaded = true;
    } catch (error) { officialError = error; }
  }
  // A negative official-API receipt must not suppress an independent fallback.
  let fallbackDownloaded: boolean;
  try { fallbackDownloaded = await dependencies.fallback(stock, fields, options); }
  catch (error) { throw officialError ?? error; }
  if (officialError) {
    const at = new Date().toISOString();
    const supplied = await facts.distinct('field', { instrumentId: stock._id, field: { $in: fields }, knownAt: { $lte: at }, validUntil: { $gte: at } });
    // A partial fallback is still stored, but it must not hide an API failure
    // for other required fields (or make an incomplete dataset look complete).
    if (!fields.every(field => supplied.includes(field))) throw officialError;
  }
  return fallbackDownloaded || downloaded;
}

export async function ensureMonthlyHistory(stock: Instrument, from: string, to: string, options: { maxWaitMs?: number } = {}, request = dhanRequest) {
  const receipts = await DatasetReceiptModel.find({ instrumentId: stock._id, kind: 'daily', from: { $lt: to }, to: { $gt: from } }).select('from to').lean();
  const gaps = missingHistoryRanges(from, to, receipts.flatMap(x => x.from && x.to ? [{ from: x.from, to: x.to }] : []));
  const earliest = gaps.length ? await storedCandles.findOne({ instrumentId: stock._id, interval: '1d' }).sort({ time: 1 }).select('time').lean() : null;
  const firstDay = earliest ? new Date(Date.parse(earliest.time) + 19800000).toISOString().slice(0, 10) : undefined;
  for (const gap of gaps) {
    if (isClosedHistoryRange(gap.from, gap.to)) {
      await DatasetReceiptModel.updateOne({ _id: `daily:${stock._id}:${gap.from}:${gap.to}` }, { $set: {
        instrumentId: stock._id, kind: 'daily', ...gap, checkedAt: new Date().toISOString(), records: 0, sourceUrl: CALENDAR_SOURCE,
      } }, { upsert: true });
      continue;
    }
    await downloadDailyWindows(stock, gap.from, gap.to, async (window, rows) => {
      for (let offset = 0; offset < rows.length; offset += 500) await storedCandles.bulkWrite(rows.slice(offset, offset + 500).map(row => ({ updateOne: {
        filter: { instrumentId: row.instrumentId, interval: '1d', time: row.time }, update: { $set: row }, upsert: true,
      } })));
      await DatasetReceiptModel.updateOne({ _id: `daily:${stock._id}:${window.from}:${window.to}` }, { $set: { instrumentId: stock._id, kind: 'daily', ...window, checkedAt: new Date().toISOString(), records: rows.length } }, { upsert: true });
    }, options, request, firstDay);
  }
  return gaps.length > 0;
}
