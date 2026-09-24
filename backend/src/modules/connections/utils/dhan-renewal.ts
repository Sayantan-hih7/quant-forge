import type { Connection } from '../models/connection.model.js';

export const DHAN_RENEWAL_LEAD_MS = 30 * 60_000;
export function nextDhanRenewal(expiresAt: string, now = Date.now()) {
  return new Date(Math.max(now, Date.parse(expiresAt) - DHAN_RENEWAL_LEAD_MS)).toISOString();
}
export function dhanRenewalDue(connection: Connection | null, now = Date.now()): boolean {
  if (!connection?.autoRenew || connection.tokenSource !== 'web' || !connection.encryptedToken ||
    connection.status === 'disconnected' || connection.renewalState === 'login_required') return false;
  // A new token is saved before profile verification. After a restart, verify
  // that token instead of issuing another request that invalidates it again.
  if (connection.renewalState === 'verifying') return !connection.nextRenewalAt || Date.parse(connection.nextRenewalAt) <= now;
  const expiry = Date.parse(connection.expiresAt ?? '');
  if (!Number.isFinite(expiry)) return false;
  if (expiry <= now) return true;
  return (connection.nextRenewalAt ? Date.parse(connection.nextRenewalAt) : expiry - DHAN_RENEWAL_LEAD_MS) <= now;
}
