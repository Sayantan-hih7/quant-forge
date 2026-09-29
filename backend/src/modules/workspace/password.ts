import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
export const validPasswordHash = (hash: string) => /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  if (!validPasswordHash(hash)) return false;
  const [, salt, expected] = hash.split('$');
  const actual = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
