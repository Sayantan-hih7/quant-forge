import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = { ...parse(await readFile(resolve(root, 'backend/.env'))), ...process.env };
const engineUrl = new URL(config.ENGINE_URL ?? 'http://127.0.0.1:8100');
if (!['localhost', '127.0.0.1'].includes(engineUrl.hostname)) throw new Error('The local engine needs a loopback ENGINE_URL.');
// Only the engine key is passed. Python never receives broker credentials or database access.
const allowed = [
  "PATH",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
  "HOME",
];
const childEnv: NodeJS.ProcessEnv = {
  ENGINE_TOKEN: config.ENGINE_TOKEN,
  PYTHONUNBUFFERED: "1",
};
for (const key of allowed)
  if (process.env[key]) childEnv[key] = process.env[key];
const python =
  process.platform === "win32"
    ? resolve(root, "engine/.venv/Scripts/python.exe")
    : resolve(root, "engine/.venv/bin/python");
const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "quantforge.app:app",
    "--host",
    "127.0.0.1",
    "--port",
    engineUrl.port || '8100',
    ...(process.argv.includes('--reload') ? ['--reload', '--reload-dir', resolve(root, 'engine/quantforge')] : []),
  ],
  {
    cwd: resolve(root, "engine"),
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  },
);
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', () => { console.error('Python engine could not start. Run npm run setup from the workspace root.'); process.exitCode = 1; });
