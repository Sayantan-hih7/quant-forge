import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { backtestStream } from '../src/modules/backtesting/services/portfolio-stream.js';
import type { engineInstruments } from '../src/modules/engine/services/engine.service.js';
import type { BacktestRun } from '../src/modules/backtesting/models/backtest.model.js';
import { jobs, redis } from '../src/shared/redis.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
type Instrument = Awaited<ReturnType<typeof engineInstruments>>[number];
const run = { strategy: {}, config: { ids: ['NSE:1','NSE:2'] }, snapshots: [] } as unknown as BacktestRun;
const stock = (id:string, count=1):Instrument => ({id, benchmarks:{},facts:[],reports:[],intraday:[],
  daily:Array.from({length:count},()=>({instrumentId:id,interval:'1d' as const,time:'2026-09-01T03:45:00.000Z',open:100,high:101,low:99,close:100,volume:1000}))} as unknown as Instrument);

test('stream loads bounded stock batches and retains all candles beyond the old total cap',async()=>{
  const loaded:string[]=[],seen:string[]=[];
  const input=backtestStream(run,async id=>{loaded.push(id);return stock(id,80000);},item=>seen.push(item.id));
  const header=JSON.parse((await input.next()).value!.toString());
  assert.deepEqual(loaded,[],'Metadata does not eagerly load all stock history');
  assert.deepEqual(header.config.ids,run.config.ids);
  let candleCount=0;
  for await(const bytes of input){
    const record=JSON.parse(bytes.toString());
    if(record.end){assert.equal(record.candles,160000);assert.equal(record.instruments,2);}
    else{assert.equal(record.candleEncoding,'ohlcv-v1');assert.deepEqual(record.daily[0],['2026-09-01T03:45:00.000Z',100,101,99,100,1000]);candleCount+=record.daily.length;}
  }
  assert.equal(candleCount,160000);assert.deepEqual(loaded,run.config.ids);assert.deepEqual(seen,loaded);
});

test('stream refuses mismatched history and preserves a loader failure',async()=>{
  await assert.rejects(async()=>{for await(const _ of backtestStream(run,async()=>stock('NSE:999')))void _;},/does not match/);
  await assert.rejects(async()=>{for await(const _ of backtestStream(run,async()=>{throw new Error('Fixture download failed');}))void _;},/Fixture download failed/);
});

test('new scope policy is versioned and report replay cannot reselect stocks',async()=>{
 const ready={...run,config:{...run.config,dataPolicy:'ready' as const}};
 const fresh=backtestStream(ready,async id=>stock(id));
 const header=JSON.parse((await fresh.next()).value!.toString());
 assert.equal(header.readinessVersion,1);await fresh.return(undefined);
 const replay=backtestStream(ready,async id=>stock(id),undefined,'NSE:1');
 const replayHeader=JSON.parse((await replay.next()).value!.toString());
 assert.equal(replayHeader.config.dataPolicy,undefined);assert.equal(replayHeader.readinessVersion,undefined);
 assert.deepEqual(replayHeader.config.ids,run.config.ids);await replay.return(undefined);
});
