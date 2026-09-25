import { AppError } from '../../../shared/errors.js';
import { createHttpClient } from '../../../shared/http-client.js';
import { redis } from '../../../shared/redis.js';
import { DHAN_PUBLIC_SEARCH_URL } from '../sources/dhan-public-company.js';

const client = createHttpClient();
export async function requestDhanPublic(url: string, body?: unknown, maxWaitMs = 30_000): Promise<unknown> {
  if (url !== DHAN_PUBLIC_SEARCH_URL && !/^https:\/\/dhan\.co\/stocks\/[a-z0-9-]+-share-price\/$/.test(url)) {
    throw new AppError(422, 'DHAN_PUBLIC_URL', 'Unsupported public Dhan resource');
  }
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    if (Date.now() >= deadline) throw new AppError(502, 'DHAN_PUBLIC_TIMEOUT', 'Dhan public financial data request timed out');
    const cooldown = await redis.pttl('quantforge:dhan-public:cooldown');
    if (cooldown > 0) {
      // Wait within the caller's budget instead of instantly failing every
      // remaining company while a single provider cooldown is active.
      await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(cooldown, deadline - Date.now()))));
      continue;
    }
    if (await redis.set('quantforge:dhan-public:spacing', '1', 'PX', 750, 'NX')) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  try {
    return (await client.request({ url, method: body === undefined ? 'GET' : 'POST', data: body,
      timeout: Math.max(1, Math.min(15_000, deadline - Date.now())), maxContentLength: 3_000_000,
      // Public website requests never receive broker access tokens or cookies.
    })).data as unknown;
  } catch (error) {
    if (error instanceof AppError && ['SOURCE_HTTP_403', 'SOURCE_HTTP_429', 'SOURCE_UNAVAILABLE', 'SOURCE_HTTP_502', 'SOURCE_HTTP_503'].includes(error.code)) {
      await redis.set('quantforge:dhan-public:cooldown', '1', 'PX', 60_000);
    }
    throw new AppError(502, 'DHAN_PUBLIC_UNAVAILABLE', 'Dhan public financial data could not be loaded; missing values have not been filled');
  }
}
