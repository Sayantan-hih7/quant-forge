import axios, { type AxiosRequestConfig } from 'axios';
import { Agent } from 'node:https';
import { AppError } from './errors.js';

export function createHttpClient(baseURL?: string) {
  const client = axios.create({ baseURL, timeout: 30_000, maxRedirects: 0, maxContentLength: 65_000_000, maxBodyLength: 8_000_000,
    httpsAgent: new Agent({ keepAlive: false }) });
  client.interceptors.request.use(config => {
    config.headers.set('User-Agent', 'QuantForge/0.1 (local research)');
    config.headers.set('Accept', 'application/json, text/csv, text/plain, */*');
    return config;
  });
  client.interceptors.response.use(response => response, (error: unknown) => {
    if (error instanceof AppError) return Promise.reject(error);
    if (!axios.isAxiosError(error)) return Promise.reject(new AppError(502, 'SOURCE_REQUEST', 'Provider request failed'));
    const status = error.response?.status;
    const host = new URL(error.config?.url ?? '/', error.config?.baseURL ?? 'https://provider.invalid').hostname;
    // Axios errors contain the entire request including credentials. Replace, never log/forward them.
    return Promise.reject(new AppError(status === 401 || status === 403 ? 424 : 502,
      status ? `SOURCE_HTTP_${status}` : 'SOURCE_UNAVAILABLE', status ? `${host} returned HTTP ${status}` : `${host} is unavailable or timed out`));
  });
  return client;
}
const publicClient = createHttpClient();

// Every integration supplies its own fixed URL. User-controlled arbitrary fetch URLs are not accepted.
export async function download(url: string, options: AxiosRequestConfig = {}, maxBytes = 65_000_000) {
  for (let attempt = 0; ; attempt++) {
    try {
      const location = new URL(url);
      // Some legacy BSE gross-delivery files return malformed whitespace in HTTP headers.
      // Tolerance is scoped to this public, credential-free HTTPS archive; redirects and connection reuse stay off.
      const legacyBseArchive = location.origin === 'https://www.bseindia.com' && /^\/BSEDATA\/gross\/\d{4}\/SCBSEALL\d{4}\.TXT$/.test(location.pathname);
      const response = await publicClient.request({ ...options, url, responseType: 'arraybuffer', maxContentLength: maxBytes,
        ...(legacyBseArchive ? { insecureHTTPParser: true } : {}) });
      return Buffer.from(response.data);
    } catch (error) {
      if (attempt >= 2 || !(error instanceof AppError) || !['SOURCE_UNAVAILABLE', 'SOURCE_HTTP_502', 'SOURCE_HTTP_503', 'SOURCE_HTTP_504'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}
export async function downloadJson(url: string, options: AxiosRequestConfig = {}) {
  const bytes = await download(url, options, 8_000_000);
  try { return JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { throw new AppError(502, 'SOURCE_FORMAT', 'Provider returned an invalid JSON response'); }
}
export function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim().replaceAll(',', '');
  if (!text || text === '-' || text.toLowerCase() === 'na' || text.toLowerCase() === 'null') return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
