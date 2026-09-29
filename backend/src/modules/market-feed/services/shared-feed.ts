import { randomUUID } from 'node:crypto';
import type { ChildEvent, FeedConnection, FeedInstrument, FeedProvider, FeedStatus, LiveQuote } from '../types/feed.types.js';
import type { QuoteTransport, TransportFactory } from '../providers/transports.js';
import { feedRetryDelay } from './recovery.js';
import { subscriptionPlan, subscriptionSignature, MOTILAL_CAPACITY, type Provider } from './subscription-plan.js';

interface Slot { connection: FeedConnection; stocks: FeedInstrument[]; transport?: QuoteTransport; generation: number; attempts: number; retryAt: number }
/** Owns a single active upstream source for each instrument across every app view. */
export class SharedFeed {
  private slots = new Map<Provider, Slot>();
  private motilalFailed = false;
  private motilalLimit = MOTILAL_CAPACITY;
  private unavailable: string[] = [];
  private latest = new Map<string, string>();
  constructor(private create: TransportFactory, private quote: (quote: LiveQuote) => void, private now = Date.now) {}
  reconcile(stocks: FeedInstrument[], options: { preference: FeedProvider; motilal: boolean; dhan: boolean }) {
    const plan = subscriptionPlan(stocks, { ...options, motilalFailed: this.motilalFailed && options.preference === 'auto' && options.dhan, motilalLimit: this.motilalLimit });
    this.unavailable = plan.unavailable;
    // Drop old routes before subscribing their replacements. Late callbacks are
    // checked against the current generation and membership, including failover.
    for (const provider of ['motilal', 'dhan'] as const) {
      const slot = this.slots.get(provider);
      if (slot && !plan[provider].length) { this.stopSlot(slot); this.slots.delete(provider); }
      else if (slot && subscriptionSignature(slot.stocks) !== subscriptionSignature(plan[provider])) {
        slot.stocks = plan[provider]; slot.connection.ids = plan[provider].map(s => s.id);
        slot.transport?.replace(slot.stocks);
      }
    }
    for (const provider of ['motilal', 'dhan'] as const) {
      if (!plan[provider].length) continue;
      let slot = this.slots.get(provider);
      if (!slot) {
        slot = { connection: { state: 'connecting', session: randomUUID(), ids: plan[provider].map(s => s.id), message: `Connecting ${provider} live prices.` }, stocks: plan[provider], generation: 0, attempts: 0, retryAt: 0 };
        this.slots.set(provider, slot);
      }
      if (!slot.transport && this.now() >= slot.retryAt) this.start(provider, slot);
    }
    const selected = new Set(stocks.map(s => s.id));
    for (const id of this.latest.keys()) if (!selected.has(id)) this.latest.delete(id);
  }
  private stopSlot(slot: Slot) { slot.generation++; const transport = slot.transport; slot.transport = undefined; transport?.stop(); }
  private fail(provider: Provider, slot: Slot, generation: number) {
    if (slot.generation !== generation) return;
    this.stopSlot(slot);
    slot.retryAt = this.now() + feedRetryDelay(slot.attempts++);
    slot.connection = { ...slot.connection, state: 'error', retryAt: new Date(slot.retryAt).toISOString(), message: slot.connection.state === 'error' ? slot.connection.message : `${provider} stream stopped. Reconnecting automatically.` };
    if (provider === 'motilal') this.motilalFailed = true;
  }
  private start(provider: Provider, slot: Slot) {
    const generation = ++slot.generation;
    slot.connection = { state: 'connecting', session: randomUUID(), ids: slot.stocks.map(s => s.id), message: `Connecting ${provider} live prices.` };
    const failed = () => this.fail(provider, slot, generation);
    const emit = (event: ChildEvent) => {
      if (slot.generation !== generation) return;
      if (event.type === 'status') {
        if (event.limit !== undefined && provider === 'motilal') this.motilalLimit = Math.min(MOTILAL_CAPACITY, event.limit);
        slot.connection = { ...slot.connection, ...event };
        if (event.state === 'error') failed();
        return;
      }
      const value = event.quote;
      if (value.source !== provider || !slot.connection.ids.includes(value.instrumentId) || !Number.isFinite(value.price) || value.price <= 0
        || !Number.isFinite(Date.parse(value.at)) || Date.parse(value.at) > this.now() + 1000
        || (this.latest.get(value.instrumentId) ?? '') > value.at) return;
      this.latest.set(value.instrumentId, value.at);
      slot.attempts = 0;
      slot.connection = { ...slot.connection, state: 'live', lastTickAt: value.at, retryAt: undefined, message: `Receiving ${provider} market ticks.` };
      this.quote({ ...value, session: slot.connection.session });
    };
    try {
      const transport = this.create(provider, slot.stocks, emit, failed);
      if (slot.generation === generation) slot.transport = transport; else transport.stop();
    } catch { failed(); }
  }
  status(): Pick<FeedStatus, 'state' | 'provider' | 'connections' | 'unavailableIds' | 'message' | 'lastTickAt' | 'limit'> {
    const connections = Object.fromEntries([...this.slots].map(([provider, slot]) => [provider, { ...slot.connection }])) as FeedStatus['connections'];
    const slots = [...this.slots.values()], live = slots.some(s => s.connection.state === 'live' && this.now() - Date.parse(s.connection.lastTickAt ?? '') < 15000);
    const state = live ? 'live' : slots.some(s => s.connection.state === 'otp-required') ? 'otp-required' : slots.some(s => s.connection.state === 'connecting') ? 'connecting' : slots.some(s => ['waiting', 'live'].includes(s.connection.state)) ? 'waiting' : slots.length || this.unavailable.length ? 'error' : 'disconnected';
    const provider = slots.length > 1 ? 'mixed' : this.slots.keys().next().value;
    const label = provider === 'mixed' ? 'Motilal + Dhan' : provider === 'motilal' ? 'Motilal' : 'Dhan';
    const message = live ? `Receiving ${label} market ticks.${this.unavailable.length ? ` ${this.unavailable.length} stocks are unavailable.` : ''}`
      : slots.find(s => s.connection.state === state)?.connection.message ?? (state === 'waiting' ? 'Feed connected. Waiting for new trades.' : this.unavailable.length ? `${this.unavailable.length} stocks need an available provider or more subscription capacity.` : 'Waiting for stock subscriptions.');
    return { state, provider, connections, unavailableIds: this.unavailable, message, limit: this.motilalLimit, lastTickAt: slots.map(s => s.connection.lastTickAt ?? '').sort().at(-1) || undefined };
  }
  otp(value: string) { this.slots.get('motilal')?.transport?.otp?.(value); }
  reset() { for (const slot of this.slots.values()) this.stopSlot(slot); this.slots.clear(); this.latest.clear(); this.motilalFailed = false; this.motilalLimit = MOTILAL_CAPACITY; this.unavailable = []; }
}

export function currentQuote(status: FeedStatus, quote: LiveQuote) {
  if (!status.connections) return quote.session === status.session && status.state === 'live';
  const connection = status.connections[quote.source];
  return !!connection && ['waiting', 'live'].includes(connection.state) && connection.session === quote.session && connection.ids.includes(quote.instrumentId);
}
