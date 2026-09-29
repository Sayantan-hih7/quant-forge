import { redis } from './redis.js';
/** A rolling deployment can start the replacement before its predecessor exits. */
export async function claimWorkerLease(key: string, owner: string, ttl: number) {
  const deadline = Date.now() + 120000;
  while (!await redis.set(key, owner, 'PX', ttl, 'NX')) {
    if (Date.now() >= deadline) throw new Error('Another worker still owns this role. Keep one replica per feed/paper component.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
