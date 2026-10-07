import { dhanRequest } from '../../connections/services/dhan.service.js';
import { DatasetReceiptModel } from '../models/dataset-receipt.model.js';
import { storedCandles } from '../repository.js';
import { historyWindows, parseDhanHistory } from '../sources/dhan-history.js';
import type { Instrument } from '../types.js';
import { missingHistoryRanges, isClosedHistoryRange } from './history-coverage.js';
import { CALENDAR_SOURCE } from '../../../shared/market-calendar.js';

/** Completed calendar days only. Current-session data has no durable receipt. */
export async function ensureIntradayHistory(stock: Instrument, from: string, to: string, options: { maxWaitMs?: number } = {}, request = dhanRequest) {
  const receipts = await DatasetReceiptModel.find({ instrumentId: stock._id, kind: 'intraday', from: { $lt: to }, to: { $gt: from } }).select('from to').lean();
  const gaps = missingHistoryRanges(from, to, receipts.flatMap(r => r.from && r.to ? [{ from: r.from, to: r.to }] : []));
  // Recent windows first: a newly listed stock may have no data in older
  // windows, but that must not prevent downloading its available sessions.
  const windows = gaps.flatMap(gap => historyWindows(gap.from, gap.to, '1m')).reverse();
  for (const window of windows) {
    if (isClosedHistoryRange(window.from, window.to)) {
      await DatasetReceiptModel.updateOne({ _id: `intraday:${stock._id}:${window.from}:${window.to}` }, { $set: {
        instrumentId: stock._id, kind: 'intraday', ...window, checkedAt: new Date().toISOString(), records: 0, sourceUrl: CALENDAR_SOURCE,
      } }, { upsert: true });
      continue;
    }
    const payload = await request('/charts/intraday', { securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY', interval: '1', oi: false,
      fromDate: `${window.from} 09:14:00`, toDate: `${window.to} 09:15:00` }, options);
    const at = new Date().toISOString();
    const rows = parseDhanHistory(payload, stock, '1m', at).filter(row => row.time >= `${window.from}T03:45:00.000Z` && row.time < `${window.to}T03:45:00.000Z`);
    for (let offset = 0; offset < rows.length; offset += 500) await storedCandles.bulkWrite(rows.slice(offset, offset + 500).map(row => ({ updateOne: {
      filter: { instrumentId: row.instrumentId, interval: '1m', time: row.time }, update: { $set: row }, upsert: true,
    } })));
    await DatasetReceiptModel.updateOne({ _id: `intraday:${stock._id}:${window.from}:${window.to}` }, { $set: {
      instrumentId: stock._id, kind: 'intraday', ...window, checkedAt: at, records: rows.length,
    } }, { upsert: true });
  }
  return gaps.length > 0;
}
