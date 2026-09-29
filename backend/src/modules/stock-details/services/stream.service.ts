import { randomUUID } from 'node:crypto';
import { redis } from '../../../shared/redis.js';
import { AppError } from '../../../shared/errors.js';
import { FEED_KEYS } from '../../market-feed/services/feed.service.js';
import { saveResearchDemand } from '../../market-feed/services/research-demand.js';
import type { FeedStatus } from '../../market-feed/types/feed.types.js';
import type { Instrument } from '../../market-data/types.js';
import type { LiveChartBar, StockQuote, StreamStatus } from '../types.js';
import { rememberQuote } from './quotes.service.js';

type Update = { quotes?: StockQuote[]; candles?: LiveChartBar[]; status?: StreamStatus };
type Consumer = { stocks: Instrument[]; candles: boolean; send: (event: Update) => void; end?: () => void };
export interface StreamDependencies {
  demand: typeof saveResearchDemand;
  status: () => Promise<FeedStatus | null>;
  subscribe: (receive: (update: Update) => void) => Promise<() => void>;
}
const dependencies: StreamDependencies = {
  demand: saveResearchDemand,
  status: async () => {
    const [raw, worker] = await Promise.all([redis.get(FEED_KEYS.status), redis.exists(FEED_KEYS.lease)]);
    return raw && worker ? JSON.parse(raw) as FeedStatus : null;
  },
  subscribe: async receive => {
    const subscriber = redis.duplicate(); subscriber.on('error', () => {});
    subscriber.on('message', (_channel, raw) => {
      try { const event = JSON.parse(raw); if (event.type === 'stock.quotes') receive(event.data); } catch { /* Invalid notification. */ }
    });
    try { await subscriber.subscribe('quantforge:events'); } catch (error) { subscriber.disconnect(); throw error; }
    return () => subscriber.disconnect();
  },
};

export function researchStreamStatus(feed: FeedStatus | null, ids: string[]): StreamStatus {
  if (!feed) return { state: 'unavailable', sessions: {}, message: 'The market-feed worker is unavailable. Last received prices remain visible.' };
  const sessions: Record<string, string> = {}, providers: string[] = [];
  for (const [provider, connection] of Object.entries(feed.connections ?? {})) {
    if (!['waiting', 'live'].includes(connection.state)) continue;
    const selected = connection.ids.filter(id => ids.includes(id));
    if (selected.length) providers.push(provider);
    for (const id of selected) sessions[id] = connection.session;
  }
  const unavailableIds = (feed.unavailableIds ?? []).filter(id => ids.includes(id));
  return { state: Object.keys(sessions).length ? 'streaming' : feed.marketClosed || unavailableIds.length || feed.state === 'error' ? 'unavailable' : 'connecting',
    sessions, providers, unavailableIds, marketClosed: feed.marketClosed,
    message: feed.marketClosed ? 'Market closed. Last trade prices are shown; streaming resumes next session.'
      : unavailableIds.length ? `${unavailableIds.length} visible stocks cannot receive streaming data. Last available prices remain visible.`
      : Object.keys(sessions).length ? 'Live feed connected. Prices change when new trades arrive.' : feed.message };
}

/** Registers visible stocks with the shared worker and relays its prices. No broker socket or paper-session mutation. */
export class StockQuoteStream {
  private owner = randomUUID();
  private consumers = new Map<string, Consumer>();
  private pending = new Map<string, StockQuote>();
  private bars = new Map<string, LiveChartBar>();
  private timer?: NodeJS.Timeout;
  private unsubscribe?: () => void;
  private subscribing = false;
  private generation = 0;
  private flushing = false;
  private renewAt = 0;
  private writes = Promise.resolve();
  constructor(private deps = dependencies) {}
  watch(stocks: Instrument[], send: Consumer['send'], end?: () => void, candles = false) {
    if (new Set([...this.ids(), ...stocks.map(s => s._id)]).size > 1000) throw new AppError(429, 'RESEARCH_FEED_LIMIT', 'Too many stocks are open. Close another stock view to receive live updates.');
    const id = randomUUID(); this.consumers.set(id, { stocks, send, end, candles });
    send({ status: { state: 'connecting', sessions: {}, message: 'Connecting to shared live prices.' } });
    this.saveDemand();
    if (!this.timer) { this.timer = setInterval(() => { void this.flush(); }, 500); this.timer.unref(); }
    void this.flush();
    return () => { this.consumers.delete(id); if (!this.consumers.size) this.close(); else this.saveDemand(); };
  }
  private ids() { return [...new Set([...this.consumers.values()].flatMap(c => c.stocks.map(s => s._id)))]; }
  private saveDemand() {
    this.renewAt = Date.now() + 5000;
    // Read current consumers when the write executes: a slow renewal must never
    // restore subscriptions that have subsequently been closed.
    this.writes = this.writes.catch(() => {}).then(() => this.deps.demand(this.owner, this.ids(), [...new Set([...this.consumers.values()].filter(c => c.candles).flatMap(c => c.stocks.map(s => s._id)))]));
    void this.writes.catch(() => {});
  }
  private async connect() {
    if (this.unsubscribe || this.subscribing) return;
    this.subscribing = true; const generation = this.generation;
    try {
      const stop = await this.deps.subscribe(update => {
        if (generation !== this.generation) return;
        for (const q of update.quotes ?? []) this.pending.set(q.instrumentId, q);
        for (const bar of update.candles ?? []) this.bars.set(`${bar.instrumentId}:${bar.time}`, bar);
      });
      if (generation !== this.generation) stop(); else this.unsubscribe = stop;
    } finally { this.subscribing = false; }
  }
  private async flush() {
    if (this.flushing || !this.consumers.size) return;
    this.flushing = true; const generation = this.generation;
    try {
      await this.connect();
      if (Date.now() >= this.renewAt) this.saveDemand();
      const feed = await this.deps.status();
      if (generation !== this.generation) return;
      const quotes = [...this.pending.values()], bars = [...this.bars.values()]; this.pending.clear(); this.bars.clear();
      for (const consumer of this.consumers.values()) {
        const ids = consumer.stocks.map(s => s._id), status = researchStreamStatus(feed, ids);
        const relevant = quotes.filter(q => q.streamSession && status.sessions?.[q.instrumentId] === q.streamSession).map(rememberQuote);
        const candles = consumer.candles ? bars.filter(b => b.streamSession && status.sessions?.[b.instrumentId] === b.streamSession) : [];
        consumer.send({ status, ...(relevant.length ? { quotes: relevant } : {}), ...(candles.length ? { candles } : {}) });
      }
    } catch {
      if (generation === this.generation) for (const c of this.consumers.values()) c.send({ status: { state: 'reconnecting', sessions: {}, message: 'Reconnecting to shared prices. Last received prices remain visible.' } });
    } finally { this.flushing = false; }
  }
  close() {
    this.generation++; clearInterval(this.timer); this.timer = undefined;
    this.unsubscribe?.(); this.unsubscribe = undefined; this.pending.clear(); this.bars.clear();
    const consumers = [...this.consumers.values()]; this.consumers.clear(); this.saveDemand();
    for (const c of consumers) c.end?.();
  }
}
export const stockQuoteStream = new StockQuoteStream();
