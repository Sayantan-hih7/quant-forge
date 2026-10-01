import WebSocket from 'ws';
import { ConnectionModel } from '../../connections/models/connection.model.js';
import { decrypt } from '../../../shared/secrets.js';
import { parseQuotePackets, streamTradeTime } from '../../stock-details/providers/dhan-quotes.js';
import type { ChildEvent, FeedInstrument } from '../types/feed.types.js';
import type { DepthBook, DepthTransportFactory } from '../services/depth-feed.js';

interface FeedCredentials { token: string; clientId: string; version: string; expiresAt: number }
async function savedCredentials(): Promise<FeedCredentials | null> {
  const saved = await ConnectionModel.findById('dhan').select('+encryptedToken').lean();
  if (!saved?.encryptedToken || saved.status !== 'connected' || !(Date.parse(saved.expiresAt ?? '') > Date.now()) || !process.env.DHAN_CLIENT_ID) return null;
  return { token: decrypt(saved.encryptedToken), clientId: process.env.DHAN_CLIENT_ID, version: saved.encryptedToken, expiresAt: Date.parse(saved.expiresAt!) };
}

/**
 * Depth-only Dhan connection in Full mode (RequestCode 21) for stocks open in research views.
 * Prices keep coming from the main feed; this socket never emits ticks, so it cannot affect paper trading.
 */
export class DhanDepthFeed {
  private socket?: WebSocket;
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private opened = Date.now();
  private encryptedToken?: string;
  private lookup = new Map<string, FeedInstrument>();
  constructor(private instruments: FeedInstrument[], private book: (book: DepthBook) => void, private failed: (message: string) => void, private credentials = savedCredentials, private createSocket = (url: URL) => new WebSocket(url.href, { handshakeTimeout: 20000 })) {}
  async start() {
    const saved = await this.credentials();
    if (this.stopped) return;
    if (!saved || saved.expiresAt <= Date.now()) { this.fail('Dhan depth needs a valid Dhan connection.'); return; }
    this.encryptedToken = saved.version;
    const url = new URL('wss://api-feed.dhan.co');
    url.search = new URLSearchParams({ version: '2', token: saved.token, clientId: saved.clientId, authType: '2' }).toString();
    const socket = this.createSocket(url); this.socket = socket; socket.binaryType = 'arraybuffer';
    this.lookup = new Map(this.instruments.map(s => [s.id, s])); this.opened = Date.now();
    this.timer = setInterval(() => { void this.check().catch(() => this.fail('Unable to verify the Dhan connection.')); }, 10000);
    socket.onopen = () => { if (this.stopped) socket.close(); else this.subscribe(21, this.instruments); };
    socket.onmessage = event => {
      if (this.stopped || !(event.data instanceof ArrayBuffer)) return;
      const receivedAt = new Date().toISOString();
      for (const packet of parseQuotePackets(Buffer.from(event.data))) {
        if (packet.kind === 'disconnect') { this.fail(`Dhan depth stream disconnected (code ${packet.code}).`); return; }
        if (packet.kind !== 'depth' || !this.lookup.has(packet.id)) continue;
        this.book({ instrumentId: packet.id, source: 'dhan', receivedAt, bids: packet.bids, asks: packet.asks, totalBuy: packet.totalBuy, totalSell: packet.totalSell, levels: 5 });
      }
    };
    socket.onerror = () => this.fail('Dhan depth stream interrupted.');
    socket.onclose = () => { if (!this.stopped) this.fail('Dhan depth stream closed.'); };
  }
  private subscribe(code: number, instruments: FeedInstrument[]) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (let offset = 0; offset < instruments.length; offset += 100) {
      const batch = instruments.slice(offset, offset + 100);
      this.socket.send(JSON.stringify({ RequestCode: code, InstrumentCount: batch.length, InstrumentList: batch.map(s => ({ ExchangeSegment: `${s.exchange}_EQ`, SecurityId: s.securityId ?? s.id.split(':')[1] })) }));
    }
  }
  replace(instruments: FeedInstrument[]) {
    const next = new Map(instruments.map(s => [s.id, s]));
    const removed = [...this.lookup.values()].filter(s => !next.has(s.id)), added = instruments.filter(s => !this.lookup.has(s.id));
    this.instruments = instruments; this.lookup = next;
    this.subscribe(22, removed); this.subscribe(21, added);
  }
  private async check() {
    if (this.stopped) return;
    const saved = await this.credentials();
    if (this.stopped) return;
    if (!saved || saved.version !== this.encryptedToken || saved.expiresAt <= Date.now()) { this.fail('Dhan credentials changed or expired.'); return; }
    if (this.socket?.readyState === WebSocket.CONNECTING && Date.now() - this.opened > 20000) this.fail('Dhan depth connection timed out.');
  }
  private fail(message: string) { if (this.stopped) return; this.stop(); this.failed(message); }
  stop() { this.stopped = true; clearInterval(this.timer); this.socket?.close(); this.socket = undefined; }
}

export const createDepthTransport: DepthTransportFactory = (stocks, book, failed) => {
  const feed = new DhanDepthFeed(stocks, book, failed);
  void feed.start().catch(() => failed('Dhan live depth unavailable.'));
  return feed;
};

/** Shared quote transport. Only read-only subscription messages are sent. */
export class DhanFeed {
  private socket?: WebSocket;
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private lastPacket = Date.now();
  private encryptedToken?: string;
  private lookup = new Map<string, FeedInstrument>();
  private previous = new Map<string, number>();
  constructor(private instruments: FeedInstrument[], private emit: (event: ChildEvent) => void, private failed: () => void, private credentials = savedCredentials, private createSocket = (url: URL) => new WebSocket(url.href, { handshakeTimeout: 20000 })) {}
  async start() {
    const saved = await this.credentials();
    if (this.stopped) return;
    if (!saved || saved.expiresAt <= Date.now()) {
      this.fail('Dhan live data needs a valid connection. Reconnect Dhan in Connections & Data.'); return;
    }
    this.encryptedToken = saved.version;
    const url = new URL('wss://api-feed.dhan.co');
    url.search = new URLSearchParams({ version: '2', token: saved.token, clientId: saved.clientId, authType: '2' }).toString();
    const socket = this.createSocket(url); this.socket = socket; socket.binaryType = 'arraybuffer';
    this.lookup = new Map(this.instruments.map(s => [s.id, s]));
    this.timer = setInterval(() => { void this.check().catch(() => this.fail('Unable to verify the Dhan connection. Retrying.')); }, 10000);
    socket.onopen = () => {
      if (this.stopped) { socket.close(); return; }
      this.subscribe(17, this.instruments);
      this.emit({ type: 'status', state: 'waiting', message: 'Subscribed to Dhan live cash-equity ticks. Waiting for fresh trades.' });
    };
    socket.onmessage = event => {
      if (this.stopped || !(event.data instanceof ArrayBuffer)) return;
      this.lastPacket = Date.now();
      const receivedAt = new Date().toISOString();
      for (const packet of parseQuotePackets(Buffer.from(event.data))) {
        if (packet.kind === 'disconnect') { this.fail(`Dhan stream disconnected (code ${packet.code}). Check connection and data access.`); return; }
        if (packet.kind === 'close') { if (this.lookup.has(packet.id)) this.previous.set(packet.id, packet.previousClose); continue; }
        if (packet.kind === 'depth') continue;
        const stock = this.lookup.get(packet.id), at = streamTradeTime(packet.seconds, receivedAt);
        // Snapshot/previous-close packets cannot become executable ticks.
        if (!stock || !at || Date.now() - Date.parse(at) > 15000 || Date.parse(at) > Date.now() + 1000) continue;
        this.emit({ type: 'tick', quote: { instrumentId: stock.id, symbol: stock.symbol, exchange: stock.exchange, price: packet.price, cumulativeVolume: packet.volume, at, receivedAt, source: 'dhan', details: { previousClose: this.previous.get(stock.id) ?? null, open: packet.open, high: packet.high, low: packet.low, averagePrice: packet.averagePrice } } });
      }
    };
    socket.onerror = () => this.fail('Dhan stream interrupted. Reconnecting automatically.');
    socket.onclose = () => { if (!this.stopped) this.fail('Dhan stream closed. Reconnecting automatically.'); };
  }
  private subscribe(code: number, instruments: FeedInstrument[]) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (let offset = 0; offset < instruments.length; offset += 100) {
      const batch = instruments.slice(offset, offset + 100);
      this.socket.send(JSON.stringify({ RequestCode: code, InstrumentCount: batch.length, InstrumentList: batch.map(s => ({ ExchangeSegment: `${s.exchange}_EQ`, SecurityId: s.securityId ?? s.id.split(':')[1] })) }));
    }
  }
  replace(instruments: FeedInstrument[]) {
    const next = new Map(instruments.map(s => [s.id, s]));
    const removed = [...this.lookup.values()].filter(s => !next.has(s.id));
    const added = instruments.filter(s => !this.lookup.has(s.id));
    this.instruments = instruments; this.lookup = next;
    for (const stock of removed) this.previous.delete(stock.id);
    this.subscribe(18, removed); this.subscribe(17, added);
  }
  private async check() {
    if (this.stopped) return;
    const saved = await this.credentials();
    if (this.stopped) return;
    if (!saved || saved.version !== this.encryptedToken || saved.expiresAt <= Date.now()) {
      this.fail('Dhan credentials changed or expired. Reconnecting with the current saved token.'); return;
    }
    if (this.socket?.readyState === WebSocket.CONNECTING && Date.now() - this.lastPacket > 20000) this.fail('Dhan live connection timed out. Retrying.');
  }
  private fail(message: string) {
    if (this.stopped) return;
    this.emit({ type: 'status', state: 'error', message }); this.stop(); this.failed();
  }
  stop() { this.stopped = true; clearInterval(this.timer); this.socket?.close(); this.socket = undefined; }
}
