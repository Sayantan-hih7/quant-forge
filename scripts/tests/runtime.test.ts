import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { Processes, portOpen, root, waitForHttp } from '../runtime.js';

test('startup waits for the expected healthy service and honours cancellation', async () => {
  let ready = false;
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ service: ready ? 'python-engine' : 'unrelated' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    assert.equal(await portOpen(address.port), true);
    await assert.rejects(waitForHttp(`http://127.0.0.1:${address.port}`, new AbortController().signal, 100, 'python-engine'), /timed out/);
    ready = true;
    await waitForHttp(`http://127.0.0.1:${address.port}`, new AbortController().signal, 1000, 'python-engine');
    const abort = new AbortController();
    abort.abort(new Error('cancelled'));
    await assert.rejects(waitForHttp(`http://127.0.0.1:${address.port}`, abort.signal), /cancelled/);
  } finally { server.closeAllConnections(); await new Promise<void>(ok => server.close(() => ok())); }
  assert.equal(await portOpen(address.port), false);
});

test('a failed service is reported and cleanup stops another owned process', { timeout: 15000 }, async () => {
  const processes = new Processes();
  const running = processes.start('test-running', process.execPath, ['-e', 'setInterval(() => {}, 1000)'], root);
  await once(running, 'spawn');
  processes.start('test-failed', process.execPath, ['-e', 'process.exit(7)'], root);
  await once(processes.abort.signal, 'abort');
  assert.match(processes.abort.signal.reason.message, /test-failed stopped \(exit 7\)/);
  const exited = once(running, 'exit');
  await processes.stop();
  await exited;
  assert.ok(running.exitCode !== null || running.signalCode !== null);
});

test('workers can release resources through IPC before process cleanup', { timeout: 15000 }, async () => {
  const processes = new Processes();
  const child = processes.start('test-graceful', process.execPath, ['-e', "process.on('message', m => { if (m.type === 'quantforge.shutdown') { process.disconnect(); process.exitCode = 0; } }); process.send({ready:true})"], root, process.env, true);
  await once(child, 'message');
  const exited = once(child, 'exit');
  await processes.stop();
  await exited;
  assert.equal(child.exitCode, 0);
  assert.equal(processes.abort.signal.aborted, false);
});
