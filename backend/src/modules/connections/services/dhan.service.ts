import { object } from '../../../shared/http-client.js';
import { ConnectionModel } from '../models/connection.model.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { decrypt, encrypt } from '../../../shared/secrets.js';
import { redis } from '../../../shared/redis.js';
import { createDhanClient, DhanRateLimitError } from '../providers/dhan.client.js';
import { parseDhanCredential, parseDhanExpiry } from '../utils/dhan-credentials.js';
import { nextDhanRenewal } from '../utils/dhan-renewal.js';
import { withDhanSessionLock } from './dhan-session-lock.js';

const authClient = createDhanClient(true);
export const dhanDataClient = createDhanClient();
const allowedPaths = new Set(['/profile', '/data/companyinfo', '/charts/historical', '/charts/intraday', '/marketfeed/quote']);
dhanDataClient.interceptors.request.use(async config => {
  if (!allowedPaths.has(config.url ?? '')) throw new AppError(403, 'READ_ONLY_PROVIDER', 'Only allowlisted market-data requests are enabled');
  const saved = await ConnectionModel.findById('dhan').select('+encryptedToken').lean();
  if (!saved?.encryptedToken || saved.status !== 'connected' || !saved.expiresAt || Date.parse(saved.expiresAt) <= Date.now()) {
    throw new AppError(424, 'DHAN_LOGIN_REQUIRED', 'Connect Dhan in Data sources before downloading history or fundamentals');
  }
  config.headers.set('access-token', decrypt(saved.encryptedToken));
  config.headers.set('client-id', process.env.DHAN_CLIENT_ID ?? '');
  return config;
});
function appHeaders() {
  invariant(process.env.DHAN_API_KEY && process.env.DHAN_API_SECRET && process.env.DHAN_CLIENT_ID, 'Dhan API key, secret and client ID must be configured on the server');
  return { app_id: process.env.DHAN_API_KEY!, app_secret: process.env.DHAN_API_SECRET! };
}
export async function beginDhanLogin() {
  const existing = await ConnectionModel.findById('dhan').lean();
  invariant(!existing?.consentExpiresAt || Date.parse(existing.consentExpiresAt) < Date.now(), 'A Dhan login is already pending; complete it or retry after ten minutes');
  const response = object((await authClient.post('/app/generate-consent', null, { params: { client_id: process.env.DHAN_CLIENT_ID }, headers: appHeaders() })).data);
  invariant(response.status === 'success' && typeof response.consentAppId === 'string', 'Dhan could not start a login session');
  await ConnectionModel.updateOne({ _id: 'dhan' }, { $set: { consentExpiresAt: new Date(Date.now() + 600_000).toISOString() } }, { upsert: true });
  return { loginUrl: `https://auth.dhan.co/login/consentApp-login?consentAppId=${encodeURIComponent(response.consentAppId)}` };
}
export async function finishDhanLogin(tokenId: string) {
  return withDhanSessionLock(async assertOwnership => {
  const credential = parseDhanCredential(tokenId);
  invariant(credential.kind === 'consent', 'Use the tokenId returned after your Dhan login');
  // Dhan validates code lifetime and app ownership. Local UI timeouts must not
  // reject a valid code copied from a registered redirect in another tab.
  const result = object((await authClient.get('/app/consumeApp-consent', { params: { tokenId: credential.value }, headers: appHeaders() })).data);
  if (typeof result.accessToken !== 'string') throw new AppError(424, 'DHAN_CONSENT_REJECTED', 'Dhan did not exchange this login code. Start a new Dhan login and paste its latest redirect URL or tokenId.');
  invariant(String(result.dhanClientId) === process.env.DHAN_CLIENT_ID && typeof result.accessToken === 'string', 'Dhan login response does not match the configured account');
  return verifyAndSaveDhanToken(result.accessToken, String(result.expiryTime ?? ''), 'oauth', false, assertOwnership);
  });
}
export async function connectDhanCredential(input: string, autoRenew = false) {
  if ([process.env.DHAN_API_KEY, process.env.DHAN_API_SECRET].includes(input.trim())) throw new AppError(422, 'DHAN_WRONG_CREDENTIAL', 'This is the API key or secret. Complete Dhan login and paste its tokenId, or generate an access token from Dhan Web.');
  const credential = parseDhanCredential(input);
  invariant(!autoRenew || credential.kind === 'access', 'Automatic renewal requires an Access Token generated in Dhan Web. A redirect URL or login code cannot be renewed automatically.');
  return credential.kind === 'consent' ? finishDhanLogin(credential.value) : saveDhanToken(credential.value, undefined, autoRenew);
}
export async function saveDhanToken(token: string, expiry?: string, autoRenew = false) {
  return withDhanSessionLock(assertOwnership => verifyAndSaveDhanToken(token, expiry, autoRenew ? 'web' : 'unknown', autoRenew, assertOwnership));
}
async function verifyAndSaveDhanToken(token: string, expiry: string | undefined, tokenSource: 'web' | 'oauth' | 'unknown', autoRenew: boolean, assertOwnership: () => Promise<void>) {
  // Verify using an independent read-only client; invalid input must not overwrite an existing session.
  invariant(process.env.DHAN_CLIENT_ID?.trim(), 'Set DHAN_CLIENT_ID on the server before connecting');
  const credential = parseDhanCredential(token);
  invariant(credential.kind === 'access', 'This is a Dhan login code. Paste it in the connection form so it can be exchanged for an access token.');
  const verifier = createDhanClient();
  const profile = object((await verifier.get('/profile', { headers: { 'access-token': credential.value } })).data);
  invariant(String(profile.dhanClientId) === process.env.DHAN_CLIENT_ID, 'Dhan token belongs to a different account');
  const parsedExpiry = parseDhanExpiry(profile.tokenValidity) ?? parseDhanExpiry(expiry);
  invariant(parsedExpiry !== undefined, 'Dhan did not return a valid token expiry');
  const expiresAt = new Date(parsedExpiry).toISOString();
  invariant(Date.parse(expiresAt) > Date.now(), 'Dhan token has expired');
  await assertOwnership();
  await ConnectionModel.updateOne({ _id: 'dhan' }, { $set: { encryptedToken: encrypt(credential.value), expiresAt,
    status: 'connected', dataPlan: String(profile.dataPlan ?? 'unknown'), dataValidity: String(profile.dataValidity ?? ''),
    verifiedAt: new Date().toISOString(), tokenSource, autoRenew, renewalState: autoRenew ? 'scheduled' : 'off',
    ...(autoRenew ? { nextRenewalAt: nextDhanRenewal(expiresAt) } : {}) },
    $unset: { consentExpiresAt: 1, renewalError: 1, lastRenewedAt: 1, ...(!autoRenew ? { nextRenewalAt: 1 } : {}) } }, { upsert: true });
  return { connected: true, expiresAt, dataPlan: profile.dataPlan, autoRenew };
}
export async function dhanRequest(path: '/data/companyinfo' | '/charts/historical' | '/charts/intraday', data: unknown, options: { maxWaitMs?: number } = {}) {
  const deadline = options.maxWaitMs ? Date.now() + options.maxWaitMs : Infinity;
  const remaining = () => {
    if (Date.now() >= deadline) throw new AppError(504, 'DHAN_WAIT_TIMEOUT', 'Chart refresh is waiting on Dhan. Stored candles are shown; try again shortly.');
    return Math.min(30_000, deadline - Date.now());
  };
  // Dhan Data APIs allow 5 requests/second. Space starts at 260 ms across all
  // workers/API processes (at most four in any second), without burst buckets.
  for (let attempt = 0; ; attempt++) {
    for (;;) {
      remaining();
      const cooldown = await redis.pttl('quantforge:dhan:cooldown');
      if (cooldown > 0) { await new Promise(resolve => setTimeout(resolve, Math.min(cooldown, 1000))); continue; }
      const spacing = path === '/data/companyinfo' ? 1500 : 260;
      const permit = await redis.set('quantforge:dhan:request-slot', '1', 'PX', spacing, 'NX');
      if (permit) break;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    try { return (await dhanDataClient.post(path, data, { timeout: remaining() })).data as unknown; }
    catch (error) {
      if (error instanceof DhanRateLimitError) {
        await redis.eval("local old=redis.call('PTTL',KEYS[1]); if old<tonumber(ARGV[1]) then redis.call('SET',KEYS[1],'1','PX',ARGV[1]); end; return 1", 1, 'quantforge:dhan:cooldown', error.retryAfterMs);
        if (attempt < 4) continue;
      }
      if (error instanceof AppError && error.code === 'DHAN_UNAVAILABLE' && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1))); continue; }
      throw error;
    }
  }
}
export async function disconnectDhan() {
  await withDhanSessionLock(async assertOwnership => {
    await assertOwnership();
    await ConnectionModel.updateOne({ _id: 'dhan' }, { $set: { status: 'disconnected', autoRenew: false, renewalState: 'off' },
      $unset: { encryptedToken: 1, consentExpiresAt: 1, nextRenewalAt: 1, renewalError: 1 } });
  });
}
