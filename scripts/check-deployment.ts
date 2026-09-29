import axios from 'axios';
import { env } from '../backend/src/config/env.js';
const origin = process.env.CHECK_APP_URL || `http://127.0.0.1:${env.PORT}`;
try {
  const { data } = await axios.get<{ checks: { label: string; state: string; message: string }[] }>(`${origin}/api/system/readiness`, {
    headers: { Authorization: `Bearer ${env.WORKSPACE_TOKEN}` }, timeout: 20000,
  });
  for (const check of data.checks) console.log(`${check.state === 'ready' ? 'OK' : 'CHECK'} | ${check.label}: ${check.message}`);
  if (data.checks.some(check => check.state !== 'ready')) process.exitCode = 1;
} catch { console.error('Readiness check failed. Start the API and check WORKSPACE_TOKEN / CHECK_APP_URL.'); process.exitCode = 1; }
