import { fork } from 'node:child_process';
import { DhanFeed } from './dhan-feed.js';
import type { ChildEvent, FeedInstrument } from '../types/feed.types.js';
import type { Provider } from '../services/subscription-plan.js';

export interface QuoteTransport { replace(stocks: FeedInstrument[]): void; stop(): void; otp?(value: string): void }
export type TransportFactory = (provider: Provider, stocks: FeedInstrument[], emit: (event: ChildEvent) => void, failed: () => void) => QuoteTransport;
export const createQuoteTransport: TransportFactory = (provider, stocks, emit, failed) => {
  if (provider === 'dhan') {
    const feed = new DhanFeed(stocks, emit, failed);
    void feed.start().catch(() => { emit({ type: 'status', state: 'error', message: 'Dhan live data unavailable. Retrying automatically.' }); failed(); });
    return feed;
  }
  const allowed = ['PATH', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'MO_ENV', 'MO_CLIENT_CODE', 'MO_PASSWORD', 'MO_2FA', 'MO_VENDOR_INFO', 'MO_TOTP_SECRET', 'MO_API_KEY', 'MO_API_SECRET_KEY', 'MO_DEVICE_MODEL', 'MO_MANUFACTURER'];
  const child = fork(new URL('./motilal-child.js', import.meta.url), [], { env: Object.fromEntries(allowed.filter(key => process.env[key]).map(key => [key, process.env[key]!])), stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  let stopped = false;
  child.on('message', (event: ChildEvent) => { if (!stopped) emit(event); });
  child.on('error', () => { if (!stopped) failed(); });
  child.on('exit', () => { if (!stopped) failed(); });
  child.send({ type: 'start', instruments: stocks });
  return {
    replace: instruments => { if (!stopped && child.connected) child.send({ type: 'replace', instruments }, () => {}); },
    otp: value => { if (!stopped && child.connected) child.send({ type: 'otp', value }, () => {}); },
    stop: () => { stopped = true; child.kill(); },
  };
};
