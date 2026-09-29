import { test } from 'node:test';
import type WebSocket from 'ws';
import assert from 'node:assert/strict';
import { DhanFeed } from '../src/modules/market-feed/providers/dhan-feed.js';
import type { ChildEvent } from '../src/modules/market-feed/types/feed.types.js';

test('Dhan execution feed subscribes read-only, rejects stale packets, and reconnects on token rotation', async t => {
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static CONNECTING = 0; static OPEN = 1;
    readyState = 1; binaryType = ''; messages: string[] = []; closed = false;
    onopen?: () => void; onmessage?: (event: { data: ArrayBuffer }) => void; onclose?: () => void; onerror?: () => void;
    constructor(_url: URL) { sockets.push(this); }
    send(message: string) { this.messages.push(message); }
    close() { this.closed = true; this.onclose?.(); }
  }
  t.mock.timers.enable({ apis: ['setInterval'] });
  const events: ChildEvent[] = []; let failures = 0, version = 'first';
  const feed = new DhanFeed([{ id: 'NSE:1', symbol: 'FIXTURE', exchange: 'NSE', securityId: '1' }], event => events.push(event), () => failures++, async () => ({ token: 'fixture-only', clientId: 'fixture', version, expiresAt: Date.now() + 3600000 }), url => new FakeSocket(url) as unknown as WebSocket);
  try {
    await feed.start(); sockets[0].onopen?.();
    assert.deepEqual(JSON.parse(sockets[0].messages[0]), { RequestCode: 17, InstrumentCount: 1, InstrumentList: [{ ExchangeSegment: 'NSE_EQ', SecurityId: '1' }] });
    const packet = (age: number) => {
      const buffer = Buffer.alloc(50); buffer[0] = 4; buffer.writeUInt16LE(50, 1); buffer[3] = 1; buffer.writeUInt32LE(1, 4);
      buffer.writeFloatLE(100, 8); buffer.writeUInt32LE(Math.floor((Date.now() - age) / 1000), 14); buffer.writeUInt32LE(2000, 22);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    };
    sockets[0].onmessage?.({ data: packet(30000) });
    assert.equal(events.filter(e => e.type === 'tick').length, 0);
    sockets[0].onmessage?.({ data: packet(0) });
    const tick = events.find(e => e.type === 'tick'); assert.equal(tick?.type === 'tick' && tick.quote.source, 'dhan');
    feed.replace([{ id: 'BSE:2', symbol: 'OTHER', exchange: 'BSE', securityId: '2' }]);
    assert.deepEqual(sockets[0].messages.slice(1).map(s => JSON.parse(s).RequestCode), [18, 17]);
    assert.equal(sockets[0].closed, false, 'Changing a page must not reconnect the socket');
    sockets[0].onmessage?.({ data: packet(0) });
    assert.equal(events.filter(e => e.type === 'tick').length, 1, 'Unsubscribed stock packets are ignored');
    version = 'renewed'; t.mock.timers.tick(10000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(failures, 1); assert.equal(sockets[0].closed, true);
    sockets[0].onmessage?.({ data: packet(0) });
    assert.equal(events.filter(e => e.type === 'tick').length, 1, 'Stopped streams cannot forward late packets');
  } finally { feed.stop(); t.mock.timers.reset(); }
});
