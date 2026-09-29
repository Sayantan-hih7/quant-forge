import { redis } from '../../../shared/redis.js';

const KEY = 'quantforge:research:demand';
export interface ResearchDemand { ids: string[]; chartIds: string[]; expiresAt: number }
export async function saveResearchDemand(owner: string, ids: string[], chartIds: string[]) {
  if (!ids.length) { await redis.hdel(KEY, owner); return; }
  await redis.hset(KEY, owner, JSON.stringify({ ids: [...new Set(ids)], chartIds: [...new Set(chartIds)], expiresAt: Date.now() + 25000 }));
}
export async function researchDemand(now = Date.now()) {
  const entries = await redis.hgetall(KEY), ids = new Set<string>(), chartIds = new Set<string>();
  for (const [owner, raw] of Object.entries(entries)) {
    let demand: ResearchDemand | undefined;
    try { demand = JSON.parse(raw) as ResearchDemand; } catch { /* Invalid demand expires. */ }
    if (!demand || !Number.isFinite(demand.expiresAt) || demand.expiresAt <= now || !Array.isArray(demand.ids) || !Array.isArray(demand.chartIds)) {
      // A late cleanup cannot remove a consumer that renewed after our read.
      await redis.eval("if redis.call('hget',KEYS[1],ARGV[1]) == ARGV[2] then return redis.call('hdel',KEYS[1],ARGV[1]) else return 0 end", 1, KEY, owner, raw);
      continue;
    }
    for (const id of demand.ids) if (typeof id === 'string') ids.add(id);
    for (const id of demand.chartIds) if (ids.has(id)) chartIds.add(id);
  }
  return { ids: [...ids], chartIds: [...chartIds] };
}
