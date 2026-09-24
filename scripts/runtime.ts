import { spawn, type ChildProcess } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv } from 'node:util';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const python = resolve(root, 'engine/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
export const require = createRequire(import.meta.url);
export const exists = async (path: string) => access(path).then(() => true, () => false);
export const localConfig = async () => ({ ...parseEnv(await readFile(resolve(root, 'backend/.env'), 'utf8')), ...process.env });

export function run(command: string, args: string[], cwd = root): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
    child.once('error', () => fail(new Error(`Could not start ${command}. Check that it is installed and on PATH.`)));
    child.once('exit', code => code === 0 ? ok() : fail(new Error(`${command} exited with code ${code ?? 'unknown'}.`)));
  });
}

export function portOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise(ok => {
    const socket = createConnection({ port, host });
    const finish = (value: boolean) => { socket.destroy(); ok(value); };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

export async function waitForHttp(url: string, signal: AbortSignal, timeout = 45_000, service?: string) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
      if (response.ok && (!service || (await response.json()).service === service)) return;
    } catch { signal.throwIfAborted(); }
    await delay(300, undefined, { signal });
  }
  throw new Error(`Startup timed out waiting for ${url}. Check the service output above.`);
}

export class Processes {
  readonly abort = new AbortController();
  private children: ChildProcess[] = [];
  private stopping = false;

  start(name: string, command: string, args: string[], cwd = root, env = process.env, graceful = false) {
    this.abort.signal.throwIfAborted();
    const child = spawn(command, args, { cwd, env, stdio: graceful ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
    this.children.push(child);
    for (const stream of [child.stdout, child.stderr]) {
      if (stream) createInterface({ input: stream }).on('line', line => console.log(`[${name}] ${line}`));
    }
    child.once('error', () => this.abort.abort(new Error(`${name} could not start.`)));
    child.once('exit', code => {
      if (!this.stopping) this.abort.abort(new Error(`${name} stopped (exit ${code ?? 'signal'}).`));
    });
    return child;
  }

  async stop() {
    this.stopping = true;
    await Promise.all(this.children.reverse().map(async child => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      if (child.connected) {
        const closed = new Promise<void>(ok => child.once('exit', () => ok()));
        child.send({ type: 'quantforge.shutdown' }, () => {});
        await Promise.race([closed, delay(5000, undefined, { ref: false })]);
        if (child.exitCode !== null || child.signalCode !== null) return;
      }
      if (process.platform === 'win32') {
        // Only process trees started by this launcher; never kill by process name.
        await new Promise<void>(ok => {
          const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          kill.once('error', () => { child.kill(); ok(); });
          kill.once('exit', () => ok());
        });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
        await Promise.race([new Promise<void>(ok => child.once('exit', () => ok())), delay(5000, undefined, { ref: false })]);
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ }
      }
    }));
  }
}
