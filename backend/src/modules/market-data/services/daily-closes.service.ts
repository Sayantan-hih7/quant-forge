import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { AppError } from '../../../shared/errors.js';
import { download } from '../../../shared/http-client.js';
import { sourceRun } from '../imports.js';
import { instruments } from '../repository.js';
import { DailyCloseModel, SourceArtifactModel } from '../models/market-data.model.js';
import { bseClosesUrl, nseClosesUrl, parseBseCloses, parseNseCloses } from '../sources/daily-closes.js';
import type { DailyClose, Exchange, Instrument } from '../types.js';

const DAY = 86_400_000;
const RETAIN_DAYS = 3 * 366;
/** Reports can appear late in the evening; a missing file is only a holiday once it is this old. */
const SETTLE_DAYS = 3;
const UNAVAILABLE_AFTER_DAYS = 10;
const istDate = (at: number) => new Date(at + 19_800_000).toISOString().slice(0, 10);
const artifactId = (exchange: Exchange, date: string) => `${exchange}:closes:${date}`;

export async function storeCloses(rows: DailyClose[]) {
  // NSE is the reference series for dual-listed companies; BSE only fills BSE-only companies.
  for (let i = 0; i < rows.length; i += 1000) await DailyCloseModel.bulkWrite(rows.slice(i, i + 1000).map(row => row.exchange === 'NSE'
    ? { updateOne: { filter: { _id: row._id }, update: { $set: row }, upsert: true } }
    : { updateOne: { filter: { _id: row._id }, update: { $setOnInsert: row }, upsert: true } }));
}
async function markArtifact(exchange: Exchange, date: string, raw: string, rowCount: number) {
  await SourceArtifactModel.updateOne({ _id: artifactId(exchange, date) }, { $set: { source: `${exchange}-closes`, date,
    checksum: createHash('sha256').update(raw).digest('hex'), rowCount, observedAt: new Date().toISOString() } }, { upsert: true });
}
/** Called by the delivery import, which already downloads the same NSE file. */
export async function storeNseClosesFromReport(raw: string, date: string, stocks: Instrument[]) {
  try {
    const rows = parseNseCloses(raw, date, stocks, new Date().toISOString());
    await storeCloses(rows); await markArtifact('NSE', date, raw, rows.length);
  } catch { /* Prices are a by-product here; the scheduled closes job retries independently. */ }
}

export async function ensureDailyCloses(exchange: Exchange, date: string, stocks: Instrument[], dependencies = { download, now: Date.now }) {
  if (await SourceArtifactModel.exists({ _id: artifactId(exchange, date) })) return 'cached' as const;
  const settled = dependencies.now() - Date.parse(`${date}T00:00:00+05:30`) > SETTLE_DAYS * DAY;
  let raw: string;
  try {
    raw = (await dependencies.download(exchange === 'NSE' ? nseClosesUrl(date) : bseClosesUrl(date),
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: exchange === 'NSE' ? 'https://www.nseindia.com/' : 'https://www.bseindia.com/' } })).toString('utf8');
  } catch (error) {
    // BSE times out (rather than 404) for a session file that does not exist.
    const missing = error instanceof AppError && (error.code === 'SOURCE_HTTP_404' || exchange === 'BSE' && error.code === 'SOURCE_UNAVAILABLE');
    if (missing && !settled) return 'pending' as const;
    if (missing && (error as AppError).code === 'SOURCE_HTTP_404') { await markArtifact(exchange, date, '', 0); return 'closed' as const; }
    // Exchanges share the holiday calendar: a BSE timeout on a day NSE reported closed is a holiday.
    if (missing && await SourceArtifactModel.exists({ _id: artifactId('NSE', date), rowCount: 0 })) { await markArtifact(exchange, date, '', 0); return 'closed' as const; }
    // BSE occasionally never publishes a session's file. After the recent window, stop retrying:
    // only BSE-only companies lose that day, and correlation tolerates a missing session.
    if (missing && dependencies.now() - Date.parse(`${date}T00:00:00+05:30`) > UNAVAILABLE_AFTER_DAYS * DAY) {
      await SourceArtifactModel.updateOne({ _id: artifactId(exchange, date) }, { $set: { source: `${exchange}-closes`, date, checksum: 'unavailable', rowCount: 0, observedAt: new Date().toISOString() } }, { upsert: true });
      return 'unavailable' as const;
    }
    throw error;
  }
  const at = new Date().toISOString();
  try {
    const rows = exchange === 'NSE' ? parseNseCloses(raw, date, stocks, at) : parseBseCloses(raw, date, new Set(stocks.map(x => x.isin)), at);
    await storeCloses(rows); await markArtifact(exchange, date, raw, rows.length);
    return 'stored' as const;
  } catch (error) {
    if (error instanceof AppError && error.code === 'NO_SESSION') {
      if (!settled) return 'pending' as const;
      await markArtifact(exchange, date, raw, 0); return 'closed' as const;
    }
    throw error;
  }
}

/** Fills every missing weekday in the window for both exchanges. Idempotent and resumable. */
export async function syncDailyCloses(days = 10, dependencies = { download, now: Date.now }) {
  return sourceRun('daily-closes', async (progress, errors) => {
    const now = dependencies.now();
    const dates = Array.from({ length: days + 1 }, (_, i) => istDate(now - i * DAY))
      .filter(date => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())).reverse();
    const counts = { stored: 0, cached: 0, closed: 0, pending: 0, unavailable: 0 };
    const total = dates.length * 2;
    let done = 0;
    for (const exchange of ['NSE', 'BSE'] as const) {
      const stocks = await instruments.find({ exchange, active: true }).lean();
      for (const date of dates) {
        try {
          const result = await ensureDailyCloses(exchange, date, stocks, dependencies);
          counts[result]++;
          if (result !== 'cached') await pause(300);
        } catch (error) {
          errors.push({ item: `${exchange} ${date}`, message: error instanceof AppError ? error.message : 'Price report unavailable' });
          // Repeated provider refusals mean the source is down; stop instead of hammering it.
          if (errors.length >= 15) throw new AppError(502, 'CLOSES_UNAVAILABLE', 'Exchange price reports are unavailable; the next scheduled run will resume.');
        }
        await progress(++done, total);
      }
    }
    const pruned = await DailyCloseModel.deleteMany({ date: { $lt: istDate(now - RETAIN_DAYS * DAY) } });
    return { ...counts, from: dates[0], to: dates.at(-1), pruned: pruned.deletedCount, definition: 'Unadjusted exchange closes for research (correlation); never used as backtest candles' };
  });
}
