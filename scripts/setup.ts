import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, python, root, run } from './runtime.js';

export async function setup() {
  await run(process.execPath, ['--import', 'tsx', 'backend/scripts/setup-local.ts']);
  if (!await exists(python)) {
    console.log('[setup] Creating the Python engine environment. Python 3.13 must be installed.');
    await run(process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['-m', 'venv', 'engine/.venv']);
  }
  const requirements = resolve(root, 'engine/requirements.lock');
  const stamp = resolve(root, 'engine/.venv/.requirements.sha256');
  const hash = createHash('sha256').update(await readFile(requirements)).digest('hex');
  const installed = await readFile(stamp, 'utf8').catch(() => '');
  if (installed !== hash) {
    await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements]);
    await writeFile(stamp, hash);
  }
  await run(python, ['-c', 'import fastapi, uvicorn, pandas, numpy']);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await setup(); console.log('Setup complete. Start Docker Desktop, then run npm run dev.'); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Setup failed.'); process.exitCode = 1; }
}
