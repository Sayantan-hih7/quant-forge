import { setTimeout as pause } from 'node:timers/promises';
import { createHttpClient } from '../../../shared/http-client.js';
import { AppError } from '../../../shared/errors.js';
import { redis } from '../../../shared/redis.js';

const client = createHttpClient();
export function isShareholdingUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.protocol !== 'https:') return false;
  return url.origin === 'https://www.nseindia.com' && url.pathname === '/api/corporate-share-holdings-master'
    || url.origin === 'https://nsearchives.nseindia.com' && /^\/corporate\/xbrl\/[\w.-]+\.xml$/.test(url.pathname)
    || url.origin === 'https://api.bseindia.com' && ['/BseIndiaAPI/api/ConsolidatePledge/w', '/BseIndiaAPI/api/Corp_shpPromoterNGroup_ng/w', '/BseIndiaAPI/api/Corp_shpSec_SHPSUMMARY_ng/w'].includes(url.pathname);
}
export async function requestShareholding(url: string): Promise<unknown> {
  if (!isShareholdingUrl(url)) throw new AppError(422, 'FILING_URL', 'Unsupported exchange filing address');
  const host = new URL(url).hostname, deadline = Date.now() + 30_000;
  for (;;) {
    if (Date.now() >= deadline) throw new AppError(502, 'FILING_BUSY', 'Shareholding provider is busy; retry later');
    if (await redis.exists(`quantforge:filing:cooldown:${host}`)) throw new AppError(502, 'FILING_BUSY', 'Shareholding provider is temporarily unavailable');
    if (await redis.set(`quantforge:filing:spacing:${host}`, '1', 'PX', 500, 'NX')) break;
    await pause(100);
  }
  try {
    // Credential-free public reader. No redirects, broker headers, cookies or connection reuse.
    const response = await client.get(url, { timeout: 15_000, maxContentLength: 5_000_000,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*', Referer: host.includes('bseindia') ? 'https://www.bseindia.com/' : 'https://www.nseindia.com/' },
      // BSE's public reader currently sends a malformed response header.
      ...(host === 'api.bseindia.com' ? { insecureHTTPParser: true } : {}) });
    return response.data as unknown;
  } catch (error) {
    if (error instanceof AppError && ['SOURCE_HTTP_403', 'SOURCE_HTTP_429', 'SOURCE_UNAVAILABLE'].includes(error.code)) {
      await redis.set(`quantforge:filing:cooldown:${host}`, '1', 'EX', 60);
    }
    throw new AppError(502, 'FILING_UNAVAILABLE', 'The exchange shareholding report could not be loaded');
  }
}
