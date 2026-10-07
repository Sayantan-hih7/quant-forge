import { test, mock, after } from 'node:test';
import type { Readable } from 'node:stream';
import { jobs, redis } from '../src/shared/redis.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { CandleModel } from '../src/modules/market-data/models/market-data.model.js';
import { BacktestRunModel, type BacktestRun } from '../src/modules/backtesting/models/backtest.model.js';
import { backtestReplay, recordedFillEvents, replayMatchesReport } from '../src/modules/backtesting/services/replay.service.js';
import { engineClient } from '../src/modules/engine/services/engine.service.js';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';

function fixture(): BacktestRun {
  const strategy = { ...researchPresets.find(p => p.draft.entry.horizon === 'swing')!.draft, _id: randomUUID(), revision: 14, savedAt: new Date().toISOString() };
  const entryAt = '2026-06-02T03:45:00+00:00';
  return { _id: randomUUID(), strategy, status: 'completed', createdAt: new Date().toISOString(), snapshots: [],
    config: { from: '2026-06-01T00:00:00+05:30', to: '2026-06-04T00:00:00+05:30', ids: ['NSE:1'], universe: 'current', includeManual: false },
    result: { trades: [{ instrumentId: 'NSE:1', entryAt, exitAt: '2026-06-03T03:45:00Z', entry: 100, exit: 108, quantity: 4, remainingQuantity: 6, pnl: 31, reason: 'Target 1' }],
      openPositions: [{ instrumentId: 'NSE:1', entryAt: '2026-06-02T09:15:00+05:30', entry: 10000, quantity: 6 }], netPnl: 43, closedTrades: 0 } };
}
test('verification requires exact recorded financials and fallback groups equivalent timestamps', () => {
  const run = fixture();
  assert.equal(replayMatchesReport(run.result!, structuredClone(run.result!)), true);
  assert.equal(replayMatchesReport(run.result!, { ...run.result, netPnl: 44 }), false);
  assert.equal(replayMatchesReport(run.result!, {}), false);
  const fills = recordedFillEvents(run, 'NSE:1');
  assert.equal(fills.filter(e => e.kind === 'entry').length, 1);
  assert.equal(fills.find(e => e.kind === 'entry')?.quantity, 10);
  assert.equal(fills.find(e => e.kind === 'exit')?.remainingQuantity, 6);
  assert.ok(fills.every(e => e.kind !== 'signal' && e.kind !== 'stop'));
});

test('replay verifies old reports, caches read-only results and falls back on disagreement', {skip:process.env.RUN_DB_TESTS !== '1'}, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-','')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString());
    await CandleModel.create(['2026-06-01','2026-06-02','2026-06-03','2026-06-04'].map(day => ({instrumentId:'NSE:1',interval:'1d' as const,time:`${day}T03:45:00.000Z`,open:100,high:110,low:95,close:105,volume:1000,source:'dhan' as const,observedAt:new Date().toISOString()})));
    const run = fixture(); await BacktestRunModel.create(run);
    const before = await BacktestRunModel.findById(run._id).lean();
    const trace = {version:1,complete:true,timeframe:'1d',events:recordedFillEvents(run,'NSE:1')};
    const post = mock.method(engineClient,'post',async (path: string, input: Readable) => {
      assert.equal(path,'/backtest-stream');
      let text='';for await(const chunk of input)text+=chunk.toString();
      const [request,stock,end]=text.trim().split('\n').map(line=>JSON.parse(line));
      assert.equal(request.replayInstrumentId,'NSE:1');
      assert.equal(request.strategy.revision,14);
      assert.equal(stock.daily.length,3);assert.equal(end.candles,3);
      return {data:{...run.result,replay:trace}};
    });
    const result = await backtestReplay(run._id,'NSE:1');
    assert.equal(result.source,'verified-reconstruction');
    assert.equal(result.frames['1d']?.at(-1)?.time,'2026-06-03');
    assert.deepEqual(await backtestReplay(run._id,'NSE:1'),result);
    assert.equal(post.mock.callCount(),1);
    assert.deepEqual(await BacktestRunModel.findById(run._id).lean(),before);
    assert.equal(await CandleModel.countDocuments(),4);
    await assert.rejects(backtestReplay(run._id,'NSE:2'),/not included/);
    const mismatch = fixture(); mismatch.result!.netPnl = 100; await BacktestRunModel.create(mismatch);
    assert.equal((await backtestReplay(mismatch._id,'NSE:1')).source,'fills-only');
    const captured = fixture(); captured.result!.replay = trace; await BacktestRunModel.create(captured);
    assert.equal((await backtestReplay(captured._id,'NSE:1')).source,'recorded');
    assert.equal(post.mock.callCount(),2);
    const corrected = fixture();
    corrected.result!.replay = {...trace,events:[...trace.events,{instrumentId:'NSE:1',kind:'signal',candle:{time:'2026-06-01T03:45:00Z',timeframe:'1d',open:100,high:111,low:95,close:105,volume:1000}}]};
    await BacktestRunModel.create(corrected);
    assert.ok((await backtestReplay(corrected._id,'NSE:1')).warnings.some(w => w.includes('changed since this run')));
  } finally {
    mock.restoreAll();
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
