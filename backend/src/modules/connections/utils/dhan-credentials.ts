import { AppError } from '../../../shared/errors.js';

const loginCode = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const accessToken = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function parseDhanCredential(input: string): { kind: 'consent' | 'access'; value: string } {
  const value = input.trim();
  if (loginCode.test(value)) return { kind: 'consent', value };
  if (accessToken.test(value)) return { kind: 'access', value };
  // Extract locally only. Never request a pasted URL, which can point at an old app.
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const codes = url.searchParams.getAll('tokenId');
      if (codes.length === 1 && loginCode.test(codes[0])) return { kind: 'consent', value: codes[0] };
    } catch { /* Use the same actionable validation message below. */ }
  }
  throw new AppError(422, 'DHAN_TOKEN_FORMAT', 'Paste the full Dhan access token, the login code (tokenId), or the redirect URL containing tokenId. An API key or API secret cannot be used here.');
}

// Dhan profile uses DD/MM/YYYY HH:mm; consent uses ISO dates in IST.
// Explicit parsing avoids US-date ambiguity and host-machine timezone dependence.
export function parseDhanExpiry(input: unknown): number | undefined {
  if (typeof input !== 'string') return undefined;
  const value = input.trim();
  const indian = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(value);
  if (!indian && !iso) return undefined;
  const parts = indian ? [indian[3], indian[2], indian[1], ...indian.slice(4), '+05:30'] : iso!.slice(1);
  const [year, month, day, hour, minute, second = '0', fraction = '0', zone = '+05:30'] = parts;
  const wall = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, Number(fraction.padEnd(3, '0')));
  const date = new Date(wall);
  if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day ||
    date.getUTCHours() !== +hour || date.getUTCMinutes() !== +minute || date.getUTCSeconds() !== +second) return undefined;
  if (zone.toUpperCase() === 'Z') return wall;
  const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4, 6));
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return undefined;
  return wall - (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60_000;
}
