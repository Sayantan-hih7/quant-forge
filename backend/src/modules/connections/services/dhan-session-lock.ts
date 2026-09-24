import { randomUUID } from 'node:crypto';
import { redis } from '../../../shared/redis.js';
import { AppError } from '../../../shared/errors.js';
import { ConnectionModel } from '../models/connection.model.js';

// All token mutations share a lease, including manual reconnect/disconnect.
// Database name isolates test workspaces and deployments sharing Redis.
export async function withDhanSessionLock<T>(work: (assertOwnership: () => Promise<void>) => Promise<T>): Promise<T> {
  const key = `quantforge:${ConnectionModel.db.name}:dhan:session-lock`;
  const owner = randomUUID();
  if (!await redis.set(key, owner, 'PX', 120_000, 'NX')) {
    throw new AppError(409, 'DHAN_SESSION_BUSY', 'Dhan is updating its connection. Please try again shortly.');
  }
  let lost = false;
  const timer = setInterval(() => {
    void redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],120000) else return 0 end", 1, key, owner)
      .then(result => { if (!result) lost = true; }).catch(() => { lost = true; });
  }, 20_000);
  timer.unref();
  const assertOwnership = async () => {
    if (lost || await redis.get(key) !== owner) throw new AppError(503, 'DHAN_SESSION_LOCK_LOST', 'Dhan connection update was interrupted. Check its status before trying again.');
  };
  try { return await work(assertOwnership); }
  finally {
    clearInterval(timer);
    await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, key, owner).catch(() => {});
  }
}
