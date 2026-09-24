import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';

const destination = fileURLToPath(new URL('../.env', import.meta.url));
try { await access(destination); console.log('Local backend environment already exists; no changes made.'); process.exit(0); } catch { /* create once */ }
const reference = process.argv[2];
const previous = reference ? parse(await readFile(reference)) : {};
const pick = (...keys: string[]) => keys.map(k => previous[k]).find(Boolean) ?? '';
const values: Record<string, string> = {
  NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4100',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/quantforge_paper?replicaSet=quantforge&directConnection=true', REDIS_URL: 'redis://127.0.0.1:6381',
  ENGINE_URL: 'http://127.0.0.1:8100', ENGINE_TOKEN: randomBytes(32).toString('hex'),
  WORKSPACE_TOKEN: randomBytes(32).toString('hex'), SECRET_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  FRONTEND_ORIGIN: 'http://localhost:5173',
  MO_ENV: pick('MO_ENV') || 'production', MO_CLIENT_CODE: pick('MO_CLIENT_CODE', 'ClientUsername'),
  MO_PASSWORD: pick('MO_PASSWORD', 'ClientPassword'), MO_2FA: pick('MO_2FA'), MO_TOTP_SECRET: pick('MO_TOTP_SECRET'),
  MO_API_KEY: pick('MO_API_KEY', 'APIKEY'), MO_API_SECRET_KEY: pick('MO_API_SECRET_KEY', 'MO_API_SECRET', 'SECRETKEY'),
  DHAN_CLIENT_ID: pick('DHAN_CLIENT_ID'), DHAN_API_KEY: pick('DHAN_API_KEY'), DHAN_API_SECRET: pick('DHAN_API_SECRET'),
  DHAN_ACCESS_TOKEN: pick('DHAN_ACCESS_TOKEN'), DHAN_PIN: pick('DHAN_PIN'), DHAN_TOTP_SECRET: pick('DHAN_TOTP_SECRET'),
};
await writeFile(destination, Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
console.log('Created backend/.env with separate local database and allowlisted provider credentials. Values were not printed.');
