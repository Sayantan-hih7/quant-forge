import type { RequestHandler } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { validPasswordHash, verifyPassword } from '../modules/workspace/password.js';
import { env } from '../config/env.js';
import { isAllowedFrontendOrigin } from '../config/frontend-origin.js';
import { redis } from '../shared/redis.js';
import { AppError } from '../shared/errors.js';
function cookieValue(cookie = '') { return /(?:^|;\s*)qf_session=([a-f0-9]{64})(?:;|$)/.exec(cookie)?.[1]; }
const hosted = () => env.NODE_ENV === 'production' || !!env.OWNER_PASSWORD_HASH;
const ownerIdentity = () => `owner:${createHash('sha256').update(env.OWNER_EMAIL.toLowerCase() + env.OWNER_PASSWORD_HASH).digest('hex')}`;
const cookieOptions = () => ({ httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/api', maxAge: 8 * 3600_000 });
async function authenticated(cookie?: string) {
  const token = cookieValue(cookie);
  const identity = token ? await redis.get(`quantforge:session:${token}`) : null;
  return identity === (hosted() ? ownerIdentity() : 'local');
}
export function assertHostedLoginConfigured() {
  if (env.NODE_ENV === 'production' && (!z.string().email().safeParse(env.OWNER_EMAIL).success || !validPasswordHash(env.OWNER_PASSWORD_HASH) || !env.FRONTEND_ORIGIN.startsWith('https://'))) {
    throw new Error('Production requires OWNER_EMAIL, a scrypt OWNER_PASSWORD_HASH, and an HTTPS FRONTEND_ORIGIN. Run npm run configure:owner locally.');
  }
}
export const workspaceSession: RequestHandler = async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ mode: hosted() ? 'owner' : 'local', authenticated: await authenticated(req.get('cookie')) });
};
export const loginWorkspace: RequestHandler = async (req, res) => {
  if (!isAllowedFrontendOrigin(req.get('origin'))) throw new AppError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed');
  const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).strict().parse(req.body);
  // Single-owner deployment: a shared atomic budget also protects across API replicas.
  const rateKey = `quantforge:login:attempts:${ownerIdentity()}`;
  const attempts = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n", 1, rateKey));
  if (attempts > 20) { res.set('Retry-After', String(Math.max(1, await redis.ttl(rateKey)))); throw new AppError(429, 'LOGIN_THROTTLED', 'Too many sign-in attempts. Try again in 15 minutes.'); }
  const correctPassword = await verifyPassword(input.password, env.OWNER_PASSWORD_HASH);
  if (!hosted() || !correctPassword || input.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) throw new AppError(401, 'LOGIN_FAILED', 'Email or password is incorrect');
  const previous = cookieValue(req.get('cookie'));
  if (previous) await redis.del(`quantforge:session:${previous}`);
  const token = randomBytes(32).toString('hex');
  await redis.set(`quantforge:session:${token}`, ownerIdentity(), 'EX', 8 * 3600);
  await redis.del(rateKey);
  res.set('Cache-Control', 'no-store').cookie('qf_session', token, cookieOptions()).json({ authenticated: true });
};
export const logoutWorkspace: RequestHandler = async (req, res) => {
  if (!isAllowedFrontendOrigin(req.get('origin'))) throw new AppError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed');
  const token = cookieValue(req.get('cookie'));
  if (token) await redis.del(`quantforge:session:${token}`);
  res.clearCookie('qf_session', cookieOptions()).sendStatus(204);
};
export const startLocalSession: RequestHandler = async (req, res) => {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  if (hosted()) throw new AppError(401, 'LOGIN_REQUIRED', 'Sign in to your paper workspace');
  if (!loopback || !isAllowedFrontendOrigin(req.get('origin'))) throw new AppError(403, 'SESSION_FORBIDDEN', 'This address cannot open a local workspace session. Open the app using its configured local address.');
  const session = randomBytes(32).toString('hex');
  await redis.set(`quantforge:session:${session}`, 'local', 'EX', 8 * 3600);
  res.cookie('qf_session', session, { httpOnly: true, sameSite: 'strict', path: '/api', maxAge: 8 * 3600_000 }).json({ mode: 'paper', authenticated: true });
};
export const requireWorkspace: RequestHandler = async (req, _res, next) => {
  const bearer = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const supplied = Buffer.from(bearer), expected = Buffer.from(env.WORKSPACE_TOKEN);
  if (expected.length && supplied.length === expected.length && timingSafeEqual(supplied, expected)) return next();
  const session = cookieValue(req.get('cookie'));
  if (!session || !await authenticated(req.get('cookie'))) throw new AppError(401, hosted() ? 'LOGIN_REQUIRED' : 'WORKSPACE_SESSION', hosted() ? 'Sign in to your paper workspace' : 'Connect to the local workspace');
  if (!['GET', 'HEAD'].includes(req.method) && !isAllowedFrontendOrigin(req.get('origin'))) throw new AppError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed');
  // Long-lived quote/event streams must also stop after logout or session expiry.
  if (req.method === 'GET') {
    const cookie = req.get('cookie');
    const timer = setInterval(() => {
      if (resStream(_res)) void authenticated(cookie).then(valid => { if (!valid) _res.end(); }).catch(() => _res.end());
    }, 15000);
    timer.unref(); _res.once('close', () => clearInterval(timer));
  }
  next();
};
function resStream(res: import('express').Response) { return String(res.getHeader('Content-Type') ?? '').includes('text/event-stream'); }
