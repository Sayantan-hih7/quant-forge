import { ConnectionModel, type Connection } from '../models/connection.model.js';
import { createDhanClient, DhanRateLimitError } from '../providers/dhan.client.js';
import { withDhanSessionLock } from './dhan-session-lock.js';
import { decrypt } from '../../../shared/secrets.js';
import { AppError } from '../../../shared/errors.js';
import { object } from '../../../shared/http-client.js';
import { parseDhanExpiry } from '../utils/dhan-credentials.js';
import { nextDhanRenewal } from '../utils/dhan-renewal.js';

export function dhanReconnectDue(c: Connection | null, startedAt: number, now = Date.now()) {
  if (!c?.encryptedToken) return false; // Explicit disconnect removes the token.
  if (!(Date.parse(c.reconnectCheckedAt ?? '') >= startedAt)) return true;
  return ['checking', 'retrying'].includes(c.reconnectState ?? '') && Date.parse(c.reconnectAt ?? '') <= now;
}

/** Verify the existing credential on startup. Never generates a login or rotates a token. */
export async function reconnectSavedDhan(startedAt: number) {
  if (!process.env.DHAN_CLIENT_ID || !dhanReconnectDue(await ConnectionModel.findById('dhan').select('+encryptedToken').lean(), startedAt)) return;
  let restored = false;
  await withDhanSessionLock(async assertOwnership => {
    const c = await ConnectionModel.findById('dhan').select('+encryptedToken').lean();
    if (!c || !dhanReconnectDue(c, startedAt)) return;
    const filter = { _id: 'dhan', encryptedToken: c.encryptedToken };
    const checkedAt = new Date().toISOString();
    await assertOwnership();
    await ConnectionModel.updateOne(filter, { $set: { reconnectState: 'checking', reconnectCheckedAt: checkedAt, reconnectAt: new Date(Date.now() + 60_000).toISOString() } });
    try {
      const profile = object((await createDhanClient().get('/profile', { headers: { 'access-token': decrypt(c.encryptedToken!) } })).data);
      if (String(profile.dhanClientId) !== process.env.DHAN_CLIENT_ID) throw new AppError(424, 'DHAN_TOKEN_REJECTED', 'Saved Dhan token does not match this account.');
      const expiry = parseDhanExpiry(profile.tokenValidity);
      if (expiry === undefined) throw new AppError(502, 'DHAN_UNAVAILABLE', 'Dhan did not confirm the token expiry.');
      if (expiry <= Date.now()) throw new AppError(424, 'DHAN_TOKEN_REJECTED', 'Saved Dhan token has expired.');
      const expiresAt = new Date(expiry).toISOString();
      await assertOwnership();
      const result = await ConnectionModel.updateOne(filter, { $set: {
        status: 'connected', expiresAt, verifiedAt: checkedAt, reconnectState: 'connected',
        dataPlan: String(profile.dataPlan ?? 'unknown'), dataValidity: String(profile.dataValidity ?? ''),
        ...(c.autoRenew && c.tokenSource === 'web' ? { renewalState: 'scheduled', nextRenewalAt: nextDhanRenewal(expiresAt) } : {}),
      }, $unset: { reconnectError: 1, reconnectAt: 1, ...(c.autoRenew && c.tokenSource === 'web' ? { renewalError: 1 } : {}) } });
      restored = result.modifiedCount === 1;
    } catch (error) {
      await assertOwnership();
      const rejected = error instanceof AppError && error.code === 'DHAN_TOKEN_REJECTED';
      const delay = error instanceof DhanRateLimitError ? Math.max(60_000, error.retryAfterMs) : 60_000;
      await ConnectionModel.updateOne(filter, { $set: {
        reconnectState: rejected ? 'login_required' : 'retrying',
        reconnectError: rejected ? 'Dhan rejected the saved token. Connect with a fresh token; its displayed expiry does not guarantee it is still valid.' : 'Could not verify the saved Dhan token. Retrying automatically; no new login is needed yet.',
        ...(rejected ? { status: 'expired', renewalState: c.autoRenew ? 'login_required' : 'off' } : { reconnectAt: new Date(Date.now() + delay).toISOString() }),
      }, ...(rejected ? { $unset: { reconnectAt: 1, nextRenewalAt: 1 } } : {}) });
    }
  });
  if (restored) {
    const { retryResearchAfterDhanConnect } = await import('../../qualification/services/research-refresh.service.js');
    await retryResearchAfterDhanConnect();
  }
}
