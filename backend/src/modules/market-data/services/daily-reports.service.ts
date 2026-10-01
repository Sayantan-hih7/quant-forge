import { createHash } from 'node:crypto';
import { download } from '../../../shared/http-client.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { deliveryDays, instruments, storedCandles } from '../repository.js';
import { SourceArtifactModel } from '../models/market-data.model.js';
import { deliveryUrl, parseNseDelivery } from '../sources/nse-reports.js';
import { bseDeliveryUrl, parseBseDelivery } from '../sources/bse-reports.js';
import { storeNseClosesFromReport } from './daily-closes.service.js';

const pending = new Map<string, Promise<void>>();
const retryAt = new Map<string, number>();
export interface ReportPreparation {
  total: number;
  ready: number;
  unavailable: { exchange: 'NSE' | 'BSE'; date: string; message: string }[];
}
/** One cached exchange file per session, shared by all strategies and stocks. */
export async function ensureDailyReport(exchange: 'NSE' | 'BSE', date: string, dependencies = { download }) {
  const key = `${exchange}:delivery:${date}`;
  if (pending.has(key)) return pending.get(key)!;
  const action = (async () => {
    if (await SourceArtifactModel.exists({ _id: key })) return;
    invariant(date <= new Date(Date.now() + 19800000).toISOString().slice(0, 10), 'Cannot download a future session report');
    if ((retryAt.get(key) ?? 0) > Date.now()) throw new AppError(503, 'REPORT_NOT_READY', `${exchange} turnover report for ${date} is not available yet; retry scheduled.`);
    const stocks = await instruments.find({ exchange, active: true }).lean();
    let raw: string, at: string, rows: ReturnType<typeof parseNseDelivery>;
    try {
      raw = (await dependencies.download(exchange === 'NSE' ? deliveryUrl(date) : bseDeliveryUrl(date))).toString('utf8');
      at = new Date().toISOString();
      rows = exchange === 'NSE' ? parseNseDelivery(raw, date, stocks, at) : parseBseDelivery(raw, date, stocks, at);
    } catch (error) {
      retryAt.set(key, Date.now() + 15 * 60_000);
      for (const [id, until] of retryAt) if (until < Date.now()) retryAt.delete(id);
      throw new AppError(503, 'REPORT_UNAVAILABLE', error instanceof AppError ? error.message : `${exchange} turnover report for ${date} could not be read.`);
    }
    // Database failures must still fail the job; they are not provider data gaps.
    for (let offset = 0; offset < rows.length; offset += 500) await deliveryDays.bulkWrite(rows.slice(offset, offset + 500).map(row => ({ updateOne: {
      filter: { _id: row._id }, update: { $setOnInsert: row }, upsert: true,
    } })));
    await SourceArtifactModel.updateOne({ _id: key }, { $setOnInsert: { source: exchange, date, checksum: createHash('sha256').update(raw).digest('hex'), rowCount: rows.length, observedAt: at } }, { upsert: true });
    if (exchange === 'NSE') await storeNseClosesFromReport(raw, date, stocks);
    retryAt.delete(key);
  })();
  pending.set(key, action);
  try { await action; } finally { pending.delete(key); }
}

/** Dates come from completed stored sessions, including special weekend sessions. */
export async function ensureRuleReports(ids: string[], from: string, cutoff: string, dependencies = { ensureDailyReport }): Promise<ReportPreparation> {
  const result: ReportPreparation = { total: 0, ready: 0, unavailable: [] };
  const stocks = await instruments.find({ _id: { $in: ids } }).select('_id exchange').lean();
  for (const exchange of ['NSE', 'BSE'] as const) {
    const exchangeIds = stocks.filter(stock => stock.exchange === exchange).map(stock => stock._id);
    if (!exchangeIds.length) continue;
    const times = await storedCandles.distinct('time', { instrumentId: { $in: exchangeIds }, interval: '1d', time: { $gte: `${from}T00:00:00.000Z`, $lt: cutoff } });
    const dates = [...new Set(times.map(time => new Date(Date.parse(time) + 19800000).toISOString().slice(0, 10)))].filter(date => Date.parse(`${date}T10:00:00.000Z`) <= Date.parse(cutoff)).sort().reverse();
    for (const date of dates) {
      result.total++;
      try { await dependencies.ensureDailyReport(exchange, date); result.ready++; }
      catch (error) {
        if (!(error instanceof AppError) || !['REPORT_NOT_READY', 'REPORT_UNAVAILABLE'].includes(error.code)) throw error;
        result.unavailable.push({ exchange, date, message: error.message });
      }
    }
  }
  return result;
}
