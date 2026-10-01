import type { FeedInstrument, LiveBook } from '../types/feed.types.js';
import { feedRetryDelay } from './recovery.js';
import { subscriptionSignature } from './subscription-plan.js';

export type DepthBook = Omit<LiveBook, 'session'>;
export interface DepthTransport { replace(stocks: FeedInstrument[]): void; stop(): void }
export type DepthTransportFactory = (stocks: FeedInstrument[], book: (book: DepthBook) => void, failed: (message: string) => void) => DepthTransport;
/** Research views only; well under Dhan's per-connection instrument limit. */
export const DEPTH_CAPACITY = 50;

/**
 * Keeps one depth-only connection subscribed to the stocks open in research views.
 * It is independent of the price feed: failures only affect depth, never prices or paper trading.
 */
export class DepthFeed {
  private transport?: DepthTransport;
  private stocks: FeedInstrument[] = [];
  private generation = 0;
  private attempts = 0;
  private retryAt = 0;
  private state: { state: 'off' | 'connecting' | 'live' | 'error'; message: string; ids: string[] } = { state: 'off', message: 'No stock open for live depth.', ids: [] };
  constructor(private create: DepthTransportFactory, private book: (book: DepthBook) => void, private now = Date.now) {}
  reconcile(stocks: FeedInstrument[], enabled: boolean) {
    const next = enabled ? stocks.filter(s => s.securityId).slice(0, DEPTH_CAPACITY) : [];
    if (!next.length) { this.reset(); this.state = { state: 'off', message: enabled ? 'No stock open for live depth.' : 'Live depth needs a connected Dhan account.', ids: [] }; return; }
    const changed = subscriptionSignature(next) !== subscriptionSignature(this.stocks);
    this.stocks = next;
    if (this.transport) { if (changed) this.transport.replace(next); this.state.ids = next.map(s => s.id); return; }
    if (this.now() < this.retryAt) return;
    const generation = ++this.generation;
    this.state = { state: 'connecting', message: 'Connecting Dhan live depth.', ids: next.map(s => s.id) };
    const failed = (message: string) => {
      if (generation !== this.generation) return;
      // Invalidate the failed connection so late packets from it are ignored.
      this.generation++; this.transport?.stop(); this.transport = undefined;
      this.retryAt = this.now() + feedRetryDelay(this.attempts++);
      this.state = { state: 'error', message: `${message} Retrying automatically.`, ids: [] };
    };
    try {
      this.transport = this.create(next, book => {
        if (generation !== this.generation || !this.stocks.some(s => s.id === book.instrumentId)) return;
        this.attempts = 0; this.state = { ...this.state, state: 'live', message: 'Receiving Dhan five-level depth.' };
        this.book(book);
      }, failed);
    } catch { failed('Dhan live depth could not start.'); }
  }
  status() { return { ...this.state, ids: [...this.state.ids] }; }
  reset() { this.generation++; this.transport?.stop(); this.transport = undefined; this.stocks = []; this.attempts = 0; this.retryAt = 0; }
}
