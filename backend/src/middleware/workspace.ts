import type { RequestHandler } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { redis } from '../shared/redis.js';
import { AppError } from '../shared/errors.js';
function cookieValue(cookie = '') { return /(?:^|;\s*)qf_session=([a-f0-9]{64})(?:;|$)/.exec(cookie)?.[1]; }
export const startLocalSession: RequestHandler = async (req, res) => {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  if (env.NODE_ENV === 'production' || !loopback || req.get('origin') !== env.FRONTEND_ORIGIN) throw new AppError(403, 'SESSION_FORBIDDEN', 'Local workspace session unavailable');
  const session = randomBytes(32).toString('hex');
  await redis.set(`quantforge:session:${session}`, 'local', 'EX', 8 * 3600);
  res.cookie('qf_session', session, { httpOnly: true, sameSite: 'strict', path: '/api', maxAge: 8 * 3600_000 }).json({ mode: 'paper', authenticated: true });
};
export const requireWorkspace: RequestHandler = async (req, _res, next) => {
  const bearer = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const supplied = Buffer.from(bearer), expected = Buffer.from(env.WORKSPACE_TOKEN);
  if (expected.length && supplied.length === expected.length && timingSafeEqual(supplied, expected)) return next();
  const session = cookieValue(req.get('cookie'));
  if (!session || !await redis.get(`quantforge:session:${session}`)) throw new AppError(401, 'WORKSPACE_SESSION', 'Connect to the local workspace');
  if (!['GET', 'HEAD'].includes(req.method) && req.get('origin') !== env.FRONTEND_ORIGIN) throw new AppError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed');
  next();
};
