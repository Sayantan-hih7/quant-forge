import { AppError, invariant } from '../../../shared/errors.js';
import { sourceRun } from '../imports.js';
import { facts, instruments, storedCandles } from '../repository.js';
import { ensureCompanyData } from './dhan-cache.service.js';
import { historyWindows, parseDhanHistory } from '../sources/dhan-history.js';
import { dhanRequest } from '../../connections/services/dhan.service.js';

export async function syncFundamentals(ids?: string[]) {
  return sourceRun('fundamentals', async (progress, errors) => {
    const stocks = await instruments.find({ active: true, ...(ids?.length ? { _id: { $in: ids } } : { primary: true }) }).lean();
    invariant(stocks.length, 'No imported instruments match this request');
    let factsWritten = 0;
    for (const [i, stock] of stocks.entries()) {
      try {
        const startedAt = new Date().toISOString();
        await ensureCompanyData(stock, ['marketCap', 'debtEquity', 'roe', 'roce', 'pe', 'sector', 'promoterHolding', 'fiiChange', 'diiChange'],
          new Date(Date.now() + 19800000).toISOString().slice(0, 7));
        factsWritten += await facts.countDocuments({ instrumentId: stock._id, observedAt: { $gte: startedAt } });
      } catch (e) {
        if (e instanceof AppError && (e.status === 424 || e.status === 429 || ['SOURCE_HTTP_404', 'SOURCE_HTTP_429', 'DHAN_ENDPOINT_UNAVAILABLE', 'DHAN_LOGIN_REQUIRED'].includes(e.code))) throw e;
        errors.push({ item: stock._id, message: e instanceof AppError ? e.message : 'Company metrics unavailable' });
      }
      await progress(i + 1, stocks.length);
    }
    return { companies: stocks.length, factsWritten, historical: false };
  });
}
export async function syncHistory(ids: string[], interval: '1d' | '1m', from: string, to: string) {
  return sourceRun(`history-${interval}`, async (progress, errors) => {
    const stocks = await instruments.find({ _id: { $in: ids }, active: true }).lean();
    invariant(stocks.length === new Set(ids).size, 'Unknown or inactive instrument in history request');
    const windows = historyWindows(from, to, interval);
    let processed = 0, candlesWritten = 0;
    for (const stock of stocks) for (const window of windows) {
      try {
        const data = await dhanRequest(interval === '1d' ? '/charts/historical' : '/charts/intraday', {
          securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY',
          oi: false, ...(interval === '1m' ? { interval: '1' } : { expiryCode: 0 }),
          fromDate: interval === '1d' ? window.from : `${window.from} 09:15:00`, toDate: interval === '1d' ? window.to : `${window.to} 09:15:00`,
        });
        const rows = parseDhanHistory(data, stock, interval, new Date().toISOString());
        for (let i = 0; i < rows.length; i += 500) await storedCandles.bulkWrite(rows.slice(i, i + 500).map(row => ({ updateOne: {
          filter: { instrumentId: row.instrumentId, interval, time: row.time }, update: { $set: row }, upsert: true,
        } })));
        candlesWritten += rows.length;
      } catch (e) {
        if (e instanceof AppError && (e.status === 424 || e.status === 429 || ['SOURCE_HTTP_429', 'DHAN_ENDPOINT_UNAVAILABLE', 'DHAN_LOGIN_REQUIRED'].includes(e.code))) throw e;
        errors.push({ item: `${stock._id} ${window.from}`, message: e instanceof AppError ? e.message : 'History unavailable' });
      }
      await progress(++processed, stocks.length * windows.length);
    }
    return { candlesWritten, interval, from, to, instruments: stocks.length };
  });
}
