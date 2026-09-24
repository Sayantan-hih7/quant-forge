import { randomUUID } from 'node:crypto';
import { ConnectionModel } from '../../connections/models/connection.model.js';
import { decrypt } from '../../../shared/secrets.js';
import type { Instrument } from '../../market-data/types.js';
import type { StockQuote, StreamStatus } from '../types.js';
import { parseQuotePackets, streamTradeTime, withMovement } from '../providers/dhan-quotes.js';
import { persistQuotes, quoteMemory, rememberQuote } from './quotes.service.js';
import { indianDate } from '../utils/chart-bars.js';
import { AppError } from '../../../shared/errors.js';

type Consumer = { stocks: Instrument[]; send: (event: { quotes?: StockQuote[]; status?: StreamStatus }) => void; end?: () => void };
/** Shared read-only research connection. It never changes Motilal subscriptions or paper execution ticks. */
export class StockQuoteStream {
  private consumers = new Map<string, Consumer>();
  private socket?: WebSocket;
  private connecting = false;
  private subscribed = new Map<string, Instrument>();
  private pending = new Map<string, StockQuote>();
  private previous = new Map<string, { price: number; day: string }>();
  private retry?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  private expiry = 0;
  private checkCredentialsAt = 0;
  private attempts = 0;
  private state: StreamStatus = { state: 'connecting' };

  watch(stocks: Instrument[], send: Consumer['send'], end?: () => void) {
    const union = new Set([...this.desired().keys(), ...stocks.map(x => x._id)]);
    if (union.size > 1000) throw new AppError(429, 'RESEARCH_FEED_LIMIT', 'Too many stocks are open across this workspace. Close another stock view to receive live updates.');
    const id = randomUUID();
    this.consumers.set(id, { stocks, send, end }); send({ status: this.state });
    if (!this.timer) { this.timer = setInterval(() => { void this.flush(); }, 500); this.timer.unref(); }
    this.sync(); void this.connect();
    return () => {
      this.consumers.delete(id); this.sync();
      if (!this.consumers.size) this.close();
    };
  }
  private status(state: StreamStatus) { this.state = state; for (const consumer of this.consumers.values()) consumer.send({ status: state }); }
  private desired() { return new Map([...this.consumers.values()].flatMap(x => x.stocks).map(x => [x._id, x])); }
  private sync() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const desired = this.desired();
    const added = [...desired.values()].filter(x => !this.subscribed.has(x._id));
    const removed = [...this.subscribed.values()].filter(x => !desired.has(x._id));
    for (const [code, stocks] of [[18, removed], [17, added]] as const) {
      for (let offset = 0; offset < stocks.length; offset += 100) {
        const batch = stocks.slice(offset, offset + 100);
        this.socket.send(JSON.stringify({ RequestCode: code, InstrumentCount: batch.length,
          InstrumentList: batch.map(x => ({ ExchangeSegment: `${x.exchange}_EQ`, SecurityId: x.securityId })) }));
      }
    }
    this.subscribed = desired;
  }
  private async connect() {
    if (!this.consumers.size || this.connecting || this.retry || this.socket) return;
    this.connecting = true;
    try {
      const saved = await ConnectionModel.findById('dhan').select('+encryptedToken').lean();
      this.expiry = Date.parse(saved?.expiresAt ?? '');
      if (!saved?.encryptedToken || saved.status !== 'connected' || !(this.expiry > Date.now()) || !process.env.DHAN_CLIENT_ID) {
        this.status({ state: 'unavailable', message: 'Connect Dhan in Connections & Data to receive live stock prices.' }); this.schedule(30_000); return;
      }
      if (!this.consumers.size) return;
      const url = new URL('wss://api-feed.dhan.co');
      url.search = new URLSearchParams({ version: '2', token: decrypt(saved.encryptedToken), clientId: process.env.DHAN_CLIENT_ID, authType: '2' }).toString();
      const socket = new WebSocket(url); this.socket = socket; socket.binaryType = 'arraybuffer';
      this.status({ state: 'connecting' });
      const timeout = setTimeout(() => { if (socket.readyState === WebSocket.CONNECTING) socket.close(); }, 12_000); timeout.unref();
      socket.onopen = () => {
        clearTimeout(timeout); if (this.socket !== socket) { socket.close(); return; }
        this.attempts = 0; this.subscribed.clear(); this.sync(); this.status({ state: 'streaming' });
      };
      socket.onmessage = event => {
        if (this.socket !== socket || !(event.data instanceof ArrayBuffer)) return;
        const receivedAt = new Date().toISOString();
        for (const packet of parseQuotePackets(Buffer.from(event.data))) {
          if (packet.kind === 'disconnect') {
            this.status({ state: 'unavailable', message: packet.code === 805 ? 'Dhan’s live-connection limit was reached. Close another Dhan stream and retry.' : 'Dhan live prices are unavailable. Check the connection and Data API access.' });
            this.schedule(30_000); socket.close(); continue;
          }
          if (!this.subscribed.has(packet.id)) continue;
          if (packet.kind === 'close') { this.previous.set(packet.id, { price: packet.previousClose, day: indianDate(receivedAt) }); continue; }
          const before = quoteMemory.get(packet.id), tradeAt = streamTradeTime(packet.seconds, receivedAt, before?.lastTradeAt);
          // Unverifiable timestamps must not overwrite a timestamped quote or become a live chart point.
          if (!tradeAt || before?.lastTradeAt && before.lastTradeAt > tradeAt) continue;
          const close = this.previous.get(packet.id);
          const previousClose = close?.day === indianDate(tradeAt) ? close.price : before?.lastTradeAt && indianDate(before.lastTradeAt) === indianDate(tradeAt) ? before.previousClose : null;
          const quote = withMovement({ instrumentId: packet.id, price: packet.price, previousClose, change: null, percent: null,
            open: packet.open, high: packet.high, low: packet.low, volume: packet.volume, averagePrice: packet.averagePrice,
            lowerCircuit: before?.lowerCircuit ?? null, upperCircuit: before?.upperCircuit ?? null,
            lastTradeAt: tradeAt, receivedAt, source: 'dhan-stream' as const });
          this.pending.set(packet.id, rememberQuote(quote));
        }
      };
      socket.onerror = () => { if (this.socket === socket) this.status({ state: 'reconnecting', message: 'Live connection interrupted. Keeping the last received price.' }); };
      socket.onclose = () => {
        clearTimeout(timeout); if (this.socket !== socket) return;
        this.socket = undefined; this.subscribed.clear();
        if (!this.retry) { this.status({ state: 'reconnecting', message: 'Reconnecting to live stock prices…' }); this.schedule(Math.min(30_000, 2000 * 2 ** Math.min(this.attempts++, 4))); }
      };
    } catch { this.status({ state: 'unavailable', message: 'Live stock prices could not connect. Last available prices remain visible.' }); this.schedule(30_000); }
    finally { this.connecting = false; }
  }
  private schedule(delay: number) {
    if (this.retry || !this.consumers.size) return;
    this.retry = setTimeout(() => { this.retry = undefined; void this.connect(); }, delay); this.retry.unref();
  }
  private async flush() {
    const quotes = [...this.pending.values()]; this.pending.clear();
    for (const consumer of this.consumers.values()) {
      const ids = new Set(consumer.stocks.map(x => x._id)); const relevant = quotes.filter(x => ids.has(x.instrumentId));
      if (relevant.length) consumer.send({ quotes: relevant });
    }
    if (quotes.length) await persistQuotes(quotes).catch(() => {});
    if (Date.now() > this.checkCredentialsAt) {
      this.checkCredentialsAt = Date.now() + 15_000;
      const saved = await ConnectionModel.findById('dhan').select('status expiresAt').lean().catch(() => null);
      if (this.socket && (saved?.status !== 'connected' || Date.parse(saved?.expiresAt ?? '') <= Date.now() || this.expiry <= Date.now())) {
        this.status({ state: 'unavailable', message: 'Dhan session expired or disconnected. Reconnect in Connections & Data.' }); this.schedule(30_000); this.socket.close();
      }
    }
  }
  close() {
    clearTimeout(this.retry); clearInterval(this.timer); this.retry = undefined; this.timer = undefined;
    const socket = this.socket; this.socket = undefined; socket?.close(); this.subscribed.clear(); this.pending.clear(); this.previous.clear();
    this.state = { state: 'connecting' };
    const consumers = [...this.consumers.values()]; this.consumers.clear();
    for (const consumer of consumers) consumer.end?.();
  }
}
export const stockQuoteStream = new StockQuoteStream();
