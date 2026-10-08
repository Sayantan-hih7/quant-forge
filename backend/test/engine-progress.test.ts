import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable,PassThrough} from 'node:stream';
import {readCalculation} from '../src/modules/backtesting/services/engine-progress.js';
test('progress reader preserves split messages and returns only a complete report',async()=>{
 const seen:string[]=[];
 const stream=Readable.from([Buffer.from('{"type":"progress","phase":"loading"}\n{"type":"res'),Buffer.from('ult","data":{"trades":[],"netPnl":12}}\n')]);
 assert.deepEqual(await readCalculation(stream,async p=>{seen.push(p.phase);}),{trades:[],netPnl:12});assert.deepEqual(seen,['loading']);
});
test('progress reader distinguishes calculation errors and truncated reports',async()=>{
 await assert.rejects(readCalculation(Readable.from([Buffer.from('{"type":"error","code":"ENGINE_VALIDATION","message":"Missing history"}\n')])),/Missing history/);
 await assert.rejects(readCalculation(Readable.from([Buffer.from('{"type":"progress","phase":"loading"}\n')])),/before a complete report/);
});
test('missing engine heartbeat times out without waiting for the full calculation limit',async()=>{
 await assert.rejects(readCalculation(new PassThrough(),undefined,20,1000),/stopped sending progress/);
});

test('heartbeats keep a long calculation alive and a socket failure never becomes a report',async()=>{
 const live=new PassThrough();
 const result=readCalculation(live,undefined,80,1000);
 const pulse=setInterval(()=>live.write('{"type":"progress","phase":"replaying"}\n'),10);
 setTimeout(()=>{clearInterval(pulse);live.end('{"type":"result","data":{"netPnl":0}}\n');},150);
 assert.deepEqual(await result,{netPnl:0});
 const broken=new PassThrough();const failure=readCalculation(broken);
 broken.destroy(new Error('ECONNRESET'));
 await assert.rejects(failure,/interrupted or unreadable/);
});
