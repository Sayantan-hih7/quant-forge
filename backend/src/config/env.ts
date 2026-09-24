import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().default(4100),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27019/quantforge_paper?replicaSet=quantforge&directConnection=true'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6381'),
  ENGINE_URL: z.string().url().default('http://127.0.0.1:8100'),
  ENGINE_TOKEN: z.string().default(''), WORKSPACE_TOKEN: z.string().default(''),
  SECRET_ENCRYPTION_KEY: z.string().default(''),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().regex(/^gemini-[a-z0-9.-]+$/).default('gemini-3.5-flash-lite'),
});
export const env = schema.parse(process.env);
if (env.NODE_ENV === 'production' && (!env.WORKSPACE_TOKEN || !env.ENGINE_TOKEN || !env.SECRET_ENCRYPTION_KEY)) {
  throw new Error('Production requires workspace, engine and encryption keys');
}
