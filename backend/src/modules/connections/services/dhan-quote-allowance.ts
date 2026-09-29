import { redis } from '../../../shared/redis.js';
import { DhanRateLimitError } from '../providers/dhan.client.js';

// One REST quote allowance across stock details and discovery. WebSocket execution is separate.
const slot = 'quantforge:research:quote-request';
const cooldown = 'quantforge:dhan:quote-cooldown';
export async function tryDhanQuoteSlot() {
  return !!await redis.eval("if redis.call('exists',KEYS[2]) == 1 then return 0 end; return redis.call('set',KEYS[1],'1','PX',1700,'NX') and 1 or 0", 2, slot, cooldown);
}
export async function recordDhanQuoteLimit(error: unknown) {
  if (!(error instanceof DhanRateLimitError)) return false;
  await redis.eval("local old=redis.call('PTTL',KEYS[1]); if old<tonumber(ARGV[1]) then redis.call('SET',KEYS[1],'1','PX',ARGV[1]); end; return 1", 1, cooldown, Math.max(5000, error.retryAfterMs));
  return true;
}
