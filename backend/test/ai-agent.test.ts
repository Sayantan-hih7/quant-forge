import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceChat,workspaceChatSchema} from '../src/modules/ai/services/workspace-chat.service.js';
import {executeAgentTool,agentToolSchema,evidenceTimes} from '../src/modules/ai/services/agent-tools.js';
import {jobs,redis} from '../src/shared/redis.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
const deps={usage:async()=>{},strategies:async()=>[],monthly:async()=>null,propose:async()=>{throw new Error('Must not draft for inspection');}};
test('agent discovers report then reads it and answers with server evidence',async()=>{
 let generations=0;const calls:string[]=[];const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Explain the latest backtest'}),undefined,{...deps,
 generate:async(_system,input)=>{generations++;if(generations===1)return {text:'Checking',action:'explain',tools:[{name:'backtests'}]};if(generations===2){assert.match(input,/report-id/);return {text:'Inspecting',action:'explain',tools:[{name:'backtests',id}]};}assert.match(input,/incomplete/);return {text:'This report has incomplete data.',action:'backtests'};},
 readTool:async call=>{calls.push(call.name);return {tool:call.name,status:'completed',checkedAt:new Date().toISOString(),summary:'Read report',data:call.id?{dataQuality:'incomplete'}:{'report-id':id}};},
 });assert.equal(generations,3);assert.equal(calls.length,2);assert.equal(result.activity.length,2);assert.equal(result.proposal,null);assert.equal(result.destination,'/strategies?tab=backtests');
});
test('repeated tool requests are bounded and cannot silently loop',async()=>{
 let reads=0;const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Check connection'}),undefined,{...deps,generate:async()=>({text:'check',action:'explain',tools:[{name:'connections'}]}),readTool:async call=>{reads++;return {tool:call.name,status:'completed',checkedAt:new Date().toISOString(),summary:'checked',data:{}};}});assert.equal(reads,1);assert.match(result.text,/check limit/);assert.equal(typeof result.activity?.[0]?.durationMs,'number');assert.ok((result.activity?.[0]?.durationMs??-1)>=0);
});
test('unknown commands and tool arguments are rejected; failures redact details',async()=>{
 assert.equal(agentToolSchema.safeParse({name:'execute-order',id:null}).success,false);assert.equal(agentToolSchema.safeParse({name:'connections',url:'http://localhost'}).success,false);
 const result=await executeAgentTool({name:'connections'},undefined,async()=>{throw new Error('SECRET provider key');});assert.equal(result.status,'unavailable');assert.ok(!JSON.stringify(result).includes('SECRET'));
 const abort=new AbortController();abort.abort();await assert.rejects(executeAgentTool({name:'connections'},abort.signal));
});

test('timestamps carry deterministic IST labels without model timezone arithmetic',()=>{
 const result=evidenceTimes({at:'2026-10-07T07:24:00Z'}) as {at:{iso:string;displayIst:string}};
 assert.equal(result.at.iso,'2026-10-07T07:24:00Z');assert.match(result.at.displayIst,/12:54:00 IST$/);
});


test('chat prepares inline workflow without executing it',async()=>{
 let prepared=0;const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Backtest my saved strategy'}),undefined,{...deps,
 generate:async()=>({text:'Ready',action:'explain',workflow:{kind:'backtest',strategyId:id}}),
 prepareWorkflow:async input=>{prepared++;assert.equal(input.strategyId,id);return {kind:'backtest',strategyId:id,revision:3,name:'Swing',cadence:'daily',horizon:'swing',capital:100000,sourceReportId:undefined};}
 });assert.equal(prepared,1);assert.ok('workflow' in result);assert.equal(result.proposal,null);assert.match(result.text,/No backtest or paper session has been started/);
});
