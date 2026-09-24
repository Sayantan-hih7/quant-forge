import axios from 'axios';
import { AppError } from '../../../shared/errors.js';
export class DhanRateLimitError extends AppError {
  constructor(public retryAfterMs: number) { super(429, 'DHAN_RATE_LIMIT', 'Dhan has temporarily limited requests. Data preparation will retry after the provider cooldown.'); }
}

export function dhanProviderError(error: unknown, auth: boolean): AppError {
  if (error instanceof AppError) return error;
  if (!axios.isAxiosError(error)) return new AppError(502, 'DHAN_UNAVAILABLE', 'Dhan could not complete the request. Please retry.');
  const status = error.response?.status;
  if (status === 429) {
    const raw = error.response?.headers?.['retry-after'];
    const delay = typeof raw === 'string' && !/^\d+(\.\d+)?$/.test(raw) ? Date.parse(raw) - Date.now() : Number(raw) * 1000;
    return new DhanRateLimitError(Number.isFinite(delay) && delay > 0 ? Math.max(1000, delay) : 60_000);
  }
  if (status === 404) return new AppError(502, 'DHAN_ENDPOINT_UNAVAILABLE', 'This data endpoint is not available from Dhan. Check API availability before retrying the import.');
  if (auth && [400, 401, 403, 410].includes(status ?? 0)) return new AppError(424, 'DHAN_CONSENT_REJECTED', 'Dhan rejected this login code. It may have expired, already been used, or belong to another API app. Start a new Dhan login and paste its latest redirect URL or tokenId.');
  if ([401, 403].includes(status ?? 0)) return new AppError(424, 'DHAN_TOKEN_REJECTED', 'Dhan rejected the access token. Generate a fresh access token in Dhan, or complete a new Dhan login. Your saved connection has not been replaced.');
  return new AppError(502, 'DHAN_UNAVAILABLE', status ? `Dhan returned HTTP ${status}. Please retry or check the Dhan service status.` : 'Dhan is unavailable or took too long to respond. Please retry.');
}

export function createDhanClient(auth = false) {
  const client = axios.create({ baseURL: auth ? 'https://auth.dhan.co' : 'https://api.dhan.co/v2', timeout: 30_000,
    maxRedirects: 0, maxContentLength: 8_000_000, maxBodyLength: 1_000_000 });
  client.interceptors.request.use(config => { config.headers.set('Accept', 'application/json'); return config; });
  // Never forward raw errors: Axios config contains credentials and consent codes.
  client.interceptors.response.use(response => response, (error: unknown) => Promise.reject(dhanProviderError(error, auth)));
  return client;
}
