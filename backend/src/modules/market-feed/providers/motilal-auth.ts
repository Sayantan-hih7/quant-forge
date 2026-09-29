import { createHmac } from 'node:crypto';
import { AppError, invariant } from '../../../shared/errors.js';
import { object } from '../../../shared/http-client.js';

export function totp(secret: string, now = Date.now()) {
  const normalized = secret.replace(/\s/g, '').toUpperCase().replace(/=+$/, '');
  invariant(/^[A-Z2-7]{16,128}$/.test(normalized), 'Motilal authenticator secret is invalid');
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const character of normalized) {
    value = value << 5 | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push(value >>> bits & 255); value &= (1 << bits) - 1; }
  }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function accepted(raw: unknown) {
  const data = object(raw);
  const code = String(data.errorcode ?? '').trim();
  if (String(data.status).toUpperCase() !== 'SUCCESS' || code) {
    const safeCode = /^MO\d{4}$/.test(code) ? ` (${code})` : '';
    const descriptions = ['invalid clientcode', 'invalid client code', 'invalid access token', 'access token missing', 'invalid api secret key', 'invalid vendorinfo', 'access denied', 'clientcode is mandatory'];
    const brokerMessage = typeof data.message === 'string' ? data.message.toLowerCase() : '';
    const description = descriptions.find(text => brokerMessage.includes(text));
    throw new AppError(424, 'MOTILAL_AUTH', `Motilal rejected the request${safeCode}.${description ? ` ${description}.` : ''} Check credentials and API access.`);
  }
  return data;
}
export function classifyLogin(raw: unknown) {
  const data = accepted(raw);
  invariant(typeof data.AuthToken === 'string' && data.AuthToken.length > 0, 'Motilal did not establish a login session');
  const verified = String(data.isAuthTokenVerified).toUpperCase();
  invariant(verified === 'TRUE' || verified === 'FALSE', 'Motilal returned an unknown verification state');
  return verified === 'TRUE';
}
export function broadcastLimit(raw: unknown) {
  const data = accepted(raw);
  const nested = object(data.data);
  const value = nested.MaxBroadcastLimit ?? data.MaxBroadcastLimit;
  invariant(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim())), 'Motilal did not return a verified broadcast subscription limit');
  const limit = Number(value);
  invariant(Number.isSafeInteger(limit) && limit >= 0, 'Motilal did not return a verified broadcast subscription limit');
  return limit;
}

export interface BroadcastLimitClient {
  m_intBroadcastLimit: number;
  setMaxBroadcastLimit(value: number): unknown;
}

export async function configureBroadcastLimit(client: BroadcastLimitClient, raw: unknown, requested: number) {
  const reported = broadcastLimit(raw);
  // The vendor's setter maps an explicit successful zero to its default (200 in
  // SDK 3.1). Zero is not an authentication failure. Missing/failed responses
  // must still fail before invoking the setter; never invent an account limit.
  await client.setMaxBroadcastLimit(reported);
  const limit = client.m_intBroadcastLimit;
  invariant(Number.isSafeInteger(limit) && limit > 0, 'Motilal SDK did not establish a broadcast subscription limit');
  invariant(Number.isSafeInteger(requested) && requested > 0 && requested <= limit, 'The requested stock count exceeds the Motilal broadcast limit.');
  return limit;
}
