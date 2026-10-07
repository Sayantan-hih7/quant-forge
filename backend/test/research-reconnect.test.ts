import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {maintenance,jobs,redis} from '../src/shared/redis.js';
import {MonthlyUniverseModel} from '../src/modules/qualification/models/qualification.model.js';
import {queueQualifiedResearchRefresh} from '../src/modules/qualification/services/research-refresh.service.js';
after(async()=>{await Promise.all([maintenance.waitUntilReady(),jobs.waitUntilReady()]);await Promise.all([maintenance.close(),jobs.close()]);if(redis.status!=='end')await redis.quit();});
test('reconnect retries completed partial jobs and failed jobs immediately, without duplicating active jobs',async(t)=>{
 t.mock.method(MonthlyUniverseModel,'findById',()=>({select:()=>({lean:async()=>({revision:1,members:[{instrumentId:'NSE:1'}]})})}));
 const retried:string[]=[];let state='completed',promoted=0,added=0;
 t.mock.method(maintenance,'getJob',async()=>({getState:async()=>state,retry:async(s:string)=>{retried.push(s);},promote:async()=>{promoted++;},finishedOn:Date.now()}));
 t.mock.method(maintenance,'add',async()=>{added++;});
 const now=Date.parse('2026-10-06T05:00:00Z');
 await queueQualifiedResearchRefresh(now,true);assert.deepEqual(retried,['completed']);
 state='failed';await queueQualifiedResearchRefresh(now,true);assert.deepEqual(retried,['completed','failed']);
 state='active';await queueQualifiedResearchRefresh(now,true);assert.equal(retried.length,2);assert.equal(added,0);
 state='delayed';await queueQualifiedResearchRefresh(now,true);assert.equal(promoted,1);
});
