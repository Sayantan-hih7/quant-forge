import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareAgentWorkflow,workflowRequestSchema} from '../src/modules/ai/services/agent-workflow.js';
import {StrategyModel} from '../src/modules/strategies/models/strategy.model.js';
import {BacktestRunModel} from '../src/modules/backtesting/models/backtest.model.js';
import {queueBacktest} from '../src/modules/backtesting/services/backtest.service.js';
import {backtestSchema} from '../src/modules/backtesting/validations/backtest.validation.js';
import {jobs,redis} from '../src/shared/redis.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function query(data:unknown){return {select:()=>query(data),lean:async()=>data} as never;}
test('workflow rejects live operations and stale or incomplete paper reports',async()=>{
 assert.equal(workflowRequestSchema.safeParse({kind:'live',strategyId:id}).success,false);
 const strategy={_id:id,revision:4,name:'Test',entry:{cadence:'daily'},risk:{initialCapital:100000}};
 const report={_id:id,status:'completed',config:{},strategy:{_id:id,revision:3},result:{}};
 const a=mock.method(StrategyModel,'findById',()=>query(strategy));const b=mock.method(BacktestRunModel,'findById',()=>query(report));
 try{await assert.rejects(prepareAgentWorkflow({kind:'paper',reportId:id}),/older rules/);
 report.strategy.revision=4;report.result={unavailableDecisions:1};await assert.rejects(prepareAgentWorkflow({kind:'paper',reportId:id}),/data gaps/);
 report.result={};const ready=await prepareAgentWorkflow({kind:'paper',reportId:id});assert.equal(ready.kind,'paper');
 }finally{a.mock.restore();b.mock.restore();}
});
test('backtest retries reuse the queued run and reject changed payload',async()=>{
 const input=backtestSchema.parse({requestId:id,strategyId:id,expectedRevision:4,from:'2025-01-01',to:'2025-01-03',universe:'current',includeManual:true,acknowledgeSelectionBias:true,ids:['NSE:1']});
 const requestFingerprint=createHash('sha256').update(JSON.stringify({...input,requestId:undefined})).digest('hex');
 const a=mock.method(BacktestRunModel,'findById',()=>query({status:'queued',requestFingerprint}));let queued=0;
 const b=mock.method(jobs,'add',async(_name:unknown,_data:unknown,options:unknown)=>{queued++;assert.deepEqual(options,{jobId:id});return {} as never;});
 try{assert.deepEqual(await queueBacktest(input),{id});assert.deepEqual(await queueBacktest(input),{id});assert.equal(queued,2);await assert.rejects(queueBacktest({...input,to:'2025-01-04'}),/different backtest/);}finally{a.mock.restore();b.mock.restore();}
});
