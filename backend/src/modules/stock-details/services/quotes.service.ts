import { redis } from '../../../shared/redis.js';
import { object } from '../../../shared/http-client.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { dhanDataClient } from '../../connections/services/dhan.service.js';
import { CandleModel, InstrumentModel } from '../../market-data/models/market-data.model.js';
import type { Instrument, Candle } from '../../market-data/types.js';
import type { StockQuote } from '../types.js';
import { parseSnapshot } from '../providers/dhan-quotes.js';

const key = (id: string) => `quantforge:research:quote:${id}`;
export const quoteMemory = new Map<string, StockQuote>();
const snapshotAt = new Map<string, number>();
export function rememberQuote(quote: StockQuote) {
  const previous = quoteMemory.get(quote.instrumentId);
  if (previous?.lastTradeAt && (!quote.lastTradeAt || previous.lastTradeAt > quote.lastTradeAt)) return previous;
  if (previous && previous.lastTradeAt === quote.lastTradeAt && previous.receivedAt > quote.receivedAt) return previous;
  if (quoteMemory.size >= 1000 && !previous) { const id = quoteMemory.keys().next().value!; quoteMemory.delete(id); snapshotAt.delete(id); }
  quoteMemory.set(quote.instrumentId, quote);
  return quote;
}
export async function persistQuotes(quotes: StockQuote[]) {
  if (!quotes.length) return;
  const pipeline = redis.pipeline();
  for (const q of quotes) pipeline.set(key(q.instrumentId), JSON.stringify(q), 'EX', 172800);
  await pipeline.exec();
}
export async function selectedInstruments(ids: string[]): Promise<Instrument[]> {
  const unique = [...new Set(ids)];
  const rows = await InstrumentModel.find({ _id: { $in: unique }, active: true }).lean();
  invariant(rows.length === unique.length, 'One or more stocks are no longer in the active stock universe');
  return rows;
}
export async function stockQuotes(stocks: Instrument[]) {
  const ids = stocks.map(x => x._id), at = new Date().toISOString();
  const cached = await redis.mget(ids.map(key));
  for (const value of cached) if (value) rememberQuote(JSON.parse(value) as StockQuote);
  let message: string | undefined;
  const missing = stocks.filter(x => { const q = quoteMemory.get(x._id); return !q || q.source === 'historical-close' || Date.now() - Date.parse(q.receivedAt) > 10_000 || Date.now() - (snapshotAt.get(x._id) ?? 0) > 60_000; });
  if (missing.length && await redis.set('quantforge:research:quote-request', '1', 'PX', 1100, 'NX')) {
    try {
      // The quote endpoint has its own 1 request/second limit, separate from candle imports.
      const body: Record<string, number[]> = {};
      for (const stock of missing) (body[`${stock.exchange}_EQ`] ??= []).push(Number(stock.securityId));
      const response = object((await dhanDataClient.post('/marketfeed/quote', body, { timeout: 12_000 })).data);
      if (response.status !== 'success') throw new AppError(502, 'QUOTE_UNAVAILABLE', 'Dhan did not return current stock quotes.');
      const data = object(response.data), fresh: StockQuote[] = [];
      for (const stock of missing) {
        const quote = parseSnapshot(stock._id, object(data[`${stock.exchange}_EQ`])[stock.securityId], new Date().toISOString());
        if (quote) { snapshotAt.set(stock._id, Date.now()); fresh.push(rememberQuote(quote)); }
      }
      await persistQuotes(fresh);
    } catch (error) { message = error instanceof AppError ? error.message : 'Current quotes could not be refreshed. Last available prices are shown.'; }
  }
  const absent = ids.filter(id => !quoteMemory.has(id));
  if (absent.length) {
    const rows = await CandleModel.aggregate<{ _id: string; bars: Candle[] }>([
      { $match: { instrumentId: { $in: absent }, interval: '1d', time: { $lte: at } } },
      { $sort: { time: -1 } },
      { $group: { _id: '$instrumentId', bars: { $firstN: { input: '$$ROOT', n: 2 } } } },
    ]);
    for (const row of rows) {
      const [bar] = row.bars;
      // Stored bars may have gaps. Do not call the preceding stored bar yesterday's close.
      rememberQuote({ instrumentId: row._id, price: bar.close, previousClose: null,
        open: bar.open, high: bar.high, low: bar.low, volume: bar.volume, averagePrice: null, lowerCircuit: null, upperCircuit: null,
        source: 'historical-close', lastTradeAt: `${bar.time.slice(0, 10)}T10:00:00.000Z`, receivedAt: bar.observedAt, change: null, percent: null });
    }
  }
  return { quotes: ids.map(id => quoteMemory.get(id)).filter((x): x is StockQuote => !!x), message, checkedAt: at };
}
