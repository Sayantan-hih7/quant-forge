import { randomUUID } from 'node:crypto';
import { redis } from '../../../shared/redis.js';
import { AppError } from '../../../shared/errors.js';
import { object } from '../../../shared/http-client.js';
import { dhanDataClient } from '../../connections/services/dhan.service.js';
import { recordDhanQuoteLimit, tryDhanQuoteSlot } from '../../connections/services/dhan-quote-allowance.js';
import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import { parseSnapshot } from '../../stock-details/providers/dhan-quotes.js';
import type { DiscoveryQuote } from '../types.js';
import { enrichClosingQuotes } from '../providers/nse-reference.js';
import { DiscoverySnapshotModel } from '../models/discovery.model.js';
import { discoverySession, snapshotDue } from '../utils/session.js';

const leaseKey = 'quantforge:discovery:refresh';
let pending: Promise<void> | undefined;
async function refreshSnapshot(explicit: boolean) {
  const owner = randomUUID();
  if (!await redis.set(leaseKey, owner, 'PX', 180_000, 'NX')) return;
  try {
    const cache = await DiscoverySnapshotModel.findById('cash').lean();
    if (!snapshotDue(cache, Date.now(), explicit)) return;
    const session = discoverySession()!, startedAt = new Date().toISOString();
    await DiscoverySnapshotModel.updateOne({ _id: 'cash' }, { $set: { attemptedAt: startedAt } }, { upsert: true });
    const stocks = await InstrumentModel.find({ active: true }).sort({ _id: 1 }).select('_id securityId exchange symbol series').lean();
    let quotes: DiscoveryQuote[] = [];
    let failed = 0, warning = '';
    batches: for (let offset = 0; offset < stocks.length; offset += 1000) {
      if (discoverySession()?.date !== session.date) break;
      // Lease ownership is checked before requests and publication. A stopped process cannot overwrite a successor.
      if (!await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],180000) else return 0 end", 1, leaseKey, owner)) return;
      const batch = stocks.slice(offset, offset + 1000), body: Record<string, number[]> = {};
      for (const stock of batch) if (/^\d+$/.test(stock.securityId)) (body[`${stock.exchange}_EQ`] ??= []).push(Number(stock.securityId));
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (!Object.keys(body).length) continue batches;
          const deadline = Date.now() + 90_000;
          while (!await tryDhanQuoteSlot()) {
            if (Date.now() >= deadline) throw new AppError(503, 'DISCOVERY_BUSY', 'Quote service is busy. Showing the available discovery snapshot.');
            if (!await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],180000) else return 0 end", 1, leaseKey, owner)) return;
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          const response = object((await dhanDataClient.post('/marketfeed/quote', body, { timeout: 12_000 })).data);
          if (response.status !== 'success') throw new AppError(502, 'DISCOVERY_QUOTES', 'Dhan did not return a usable market snapshot.');
          const data = object(response.data), receivedAt = new Date().toISOString();
          for (const stock of batch) {
            const quote = parseSnapshot(stock._id, object(data[`${stock.exchange}_EQ`])[stock.securityId], receivedAt);
            if (quote) quotes.push(quote);
          }
          break;
        } catch (error) {
          if (await recordDhanQuoteLimit(error) && attempt === 0) continue;
          failed++;
          warning = error instanceof AppError ? error.message : 'Market snapshots are temporarily unavailable.';
          break batches;
        }
      }
    }
    const closing = await enrichClosingQuotes(quotes, stocks, session, cache);
    quotes = closing.quotes;
    if (await redis.get(leaseKey) !== owner) return;
    const completedAt = new Date().toISOString();
    const usable = quotes.some(q => q.lastTradeAt && new Date(Date.parse(q.lastTradeAt) + 19_800_000).toISOString().slice(0, 10) === session.date);
    await DiscoverySnapshotModel.updateOne({ _id: 'cash' }, { $set: {
      ...(usable ? { quotes, sessionDate: session.date, startedAt, completedAt } : {}),
      warning: [failed ? `Market snapshot is incomplete. ${warning}` : !usable ? 'No quotes with a trade timestamp for the latest session were returned. Saved results retain their original date.' : '', closing.warning].filter(Boolean).join(' '),
    } });
  } catch (error) {
    if (await redis.get(leaseKey) === owner) await DiscoverySnapshotModel.updateOne({ _id: 'cash' }, { $set: { warning: error instanceof AppError ? error.message : 'Discovery refresh is unavailable. Saved results retain their original date.' } }).catch(() => {});
  } finally {
    await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, leaseKey, owner).catch(() => {});
  }
}
export async function discoverySnapshot(explicit = false) {
  const snapshot = await DiscoverySnapshotModel.findById('cash').lean();
  if (!pending && snapshotDue(snapshot, Date.now(), explicit)) {
    pending = refreshSnapshot(explicit).catch(() => {}).finally(() => { pending = undefined; });
  }
  const refreshing = !!pending || !!await redis.exists(leaseKey);
  return { snapshot, refreshing };
}
