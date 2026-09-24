/** Also supports the local Windows launcher, where SIGTERM cannot request graceful exit. */
export function onShutdown(handler: () => Promise<void>) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try { await handler(); }
    catch { console.error('Service cleanup did not finish cleanly.'); process.exitCode = 1; }
    finally { if (process.connected) process.disconnect(); }
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  process.on('message', (message: unknown) => {
    if (message && typeof message === 'object' && 'type' in message && message.type === 'quantforge.shutdown') void stop();
  });
}
