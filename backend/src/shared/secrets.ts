import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
function key() {
  if (!/^[a-f0-9]{64}$/i.test(env.SECRET_ENCRYPTION_KEY)) throw new AppError(503, 'ENCRYPTION_CONFIG', 'Set a 32-byte hexadecimal encryption key on the backend');
  return Buffer.from(env.SECRET_ENCRYPTION_KEY, 'hex');
}
export function encrypt(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(x => x.toString('base64')).join('.');
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
