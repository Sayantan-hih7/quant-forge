import { object } from '../../../shared/http-client.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { decrypt, encrypt } from '../../../shared/secrets.js';
import { ConnectionModel, type Connection } from '../models/connection.model.js';
import { createDhanClient, DhanRateLimitError } from '../providers/dhan.client.js';
import { parseDhanCredential, parseDhanExpiry } from '../utils/dhan-credentials.js';
import { dhanRenewalDue, nextDhanRenewal } from '../utils/dhan-renewal.js';
import { withDhanSessionLock } from './dhan-session-lock.js';

export async function setDhanAutoRenew(enabled: boolean, webTokenConfirmed = false) {
  return withDhanSessionLock(async assertOwnership => {
    const connection = await ConnectionModel.findById('dhan').select('+encryptedToken').lean();
    invariant(connection, 'Connect Dhan first');
    if (enabled) {
      invariant(connection.status === 'connected' && connection.encryptedToken && Date.parse(connection.expiresAt ?? '') > Date.now(),
        'Paste a fresh Dhan Web Access Token first. Expired tokens cannot be renewed.');
      invariant(connection.tokenSource !== 'oauth', 'Dhan browser-login tokens cannot be renewed. Generate an Access Token in Dhan Web and paste it here.');
      invariant(connection.tokenSource === 'web' || webTokenConfirmed, 'Confirm that this Access Token was generated in Dhan Web');
    }
    await assertOwnership();
    await ConnectionModel.updateOne({ _id: 'dhan' }, { $set: { autoRenew: enabled,
      // Preserve verification of a token already rotated by Dhan.
      renewalState: enabled ? connection.renewalState === 'verifying' ? 'verifying' : 'scheduled' : 'off',
      ...(enabled ? { tokenSource: 'web', nextRenewalAt: nextDhanRenewal(connection.expiresAt!) } : {}) },
      $unset: { renewalError: 1, ...(!enabled ? { nextRenewalAt: 1 } : {}) } });
    return { autoRenew: enabled };
  });
}

async function verifyRenewedToken(connection: Connection, assertOwnership: () => Promise<void>) {
  const profile = object((await createDhanClient().get('/profile', { headers: { 'access-token': decrypt(connection.encryptedToken!) } })).data);
  invariant(String(profile.dhanClientId) === process.env.DHAN_CLIENT_ID, 'Dhan renewed token belongs to another account');
  const expiry = parseDhanExpiry(profile.tokenValidity);
  invariant(expiry !== undefined && expiry > Date.now(), 'Dhan did not return a valid renewed token expiry');
  // RenewToken should extend validity by 24h. Avoid repeatedly rotating a
  // token when the provider has returned a stale/unchanged profile response.
  invariant(expiry - Date.now() > 30 * 60_000, 'Dhan did not extend token validity');
  const expiresAt = new Date(expiry).toISOString();
  await assertOwnership();
  await ConnectionModel.updateOne({ _id: 'dhan', encryptedToken: connection.encryptedToken, autoRenew: true }, {
    $set: { status: 'connected', expiresAt, verifiedAt: new Date().toISOString(),
      dataPlan: String(profile.dataPlan ?? 'unknown'), dataValidity: String(profile.dataValidity ?? ''),
      renewalState: 'scheduled', nextRenewalAt: nextDhanRenewal(expiresAt), lastRenewedAt: new Date().toISOString() },
    $unset: { renewalError: 1 },
  });
}

export async function renewDhanConnectionIfDue() {
  if (!dhanRenewalDue(await ConnectionModel.findById('dhan').select('+encryptedToken').lean())) return;
  await withDhanSessionLock(async assertOwnership => {
    let connection = await ConnectionModel.findById('dhan').select('+encryptedToken').lean();
    if (!connection || !dhanRenewalDue(connection)) return;
    const expiry = Date.parse(connection.expiresAt ?? '');
    if (connection.renewalState !== 'verifying' && expiry <= Date.now()) {
      await ConnectionModel.updateOne({ _id: 'dhan', encryptedToken: connection.encryptedToken }, {
        $set: { status: 'expired', renewalState: 'login_required', renewalError: 'The token expired before it could be renewed. Paste a fresh Dhan Web Access Token with automatic renewal enabled.' },
        $unset: { nextRenewalAt: 1 },
      });
      return;
    }
    try {
      if (connection.renewalState !== 'verifying') {
        invariant(process.env.DHAN_CLIENT_ID, 'Configure the Dhan client ID first');
        await assertOwnership();
        // Documented GET endpoint. Only Dhan Web tokens are eligible; this
        // request invalidates the old token. Never log the response or headers.
        const result = object((await createDhanClient().get('/RenewToken', { headers: {
          'access-token': decrypt(connection.encryptedToken!), dhanClientId: process.env.DHAN_CLIENT_ID,
        } })).data);
        invariant(typeof result.accessToken === 'string', 'Dhan did not return a renewed access token');
        invariant(parseDhanCredential(result.accessToken).kind === 'access', 'Dhan returned an invalid renewed token');
        invariant(result.dhanClientId === undefined || String(result.dhanClientId) === process.env.DHAN_CLIENT_ID, 'Dhan renewed token belongs to another account');
        const encryptedToken = encrypt(result.accessToken);
        await assertOwnership();
        // Persist BEFORE the second network request: a temporary profile
        // outage must not lose the new token after Dhan invalidated the old one.
        const saved = await ConnectionModel.updateOne({ _id: 'dhan', encryptedToken: connection.encryptedToken, autoRenew: true }, {
          $set: { encryptedToken, renewalState: 'verifying', nextRenewalAt: new Date(Date.now() + 60_000).toISOString() },
        });
        invariant(saved.modifiedCount === 1, 'Dhan connection changed during renewal');
        connection = { ...connection, encryptedToken, renewalState: 'verifying' };
      }
      await verifyRenewedToken(connection, assertOwnership);
    } catch (error) {
      await assertOwnership();
      const terminal = error instanceof AppError && ['DHAN_TOKEN_REJECTED', 'INVALID_DATA', 'DHAN_TOKEN_FORMAT', 'DHAN_ENDPOINT_UNAVAILABLE'].includes(error.code);
      const retryMs = error instanceof DhanRateLimitError ? Math.max(60_000, error.retryAfterMs) : 5 * 60_000;
      // Fixed, safe UI messages; never store provider response bodies or Axios config.
      const renewalError = terminal
        ? 'Dhan could not renew this token. Paste a fresh Access Token generated in Dhan Web; redirect/login tokens are not eligible.'
        : connection.renewalState === 'verifying'
          ? 'The renewed token is saved. Dhan profile verification will retry automatically.'
          : 'Dhan renewal is temporarily unavailable. The backend will retry before expiry.';
      await ConnectionModel.updateOne({ _id: 'dhan', encryptedToken: connection.encryptedToken, autoRenew: true }, {
        $set: { renewalState: terminal ? 'login_required' : connection.renewalState === 'verifying' ? 'verifying' : 'retrying', renewalError,
          ...(terminal ? {} : { nextRenewalAt: new Date(connection.renewalState === 'verifying' ? Date.now() + retryMs : Math.min(Date.now() + retryMs, expiry)).toISOString() }) },
        ...(terminal ? { $unset: { nextRenewalAt: 1 } } : {}),
      });
    }
  });
}

/** Runs independently of the long-running history/qualification job queue. */
export function startDhanRenewalMonitor() {
  let running: Promise<void> | undefined;
  const tick = () => {
    if (running) return;
    running = renewDhanConnectionIfDue().catch(error => {
      if (!(error instanceof AppError && error.code === 'DHAN_SESSION_BUSY')) console.error('Dhan renewal check could not finish; it will retry.');
    }).finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await running; };
}
