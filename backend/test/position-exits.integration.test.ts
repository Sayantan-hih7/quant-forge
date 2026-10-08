import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import {env} from '../src/config/env.js';
import {jobs,redis} from '../src/shared/redis.js';
import {PaperSessionModel,PaperPositionModel,PaperOrderModel,PaperExitAmendmentModel} from '../src/modules/paper-trading/models/paper.model.js';
import {modifyPositionExits} from '../src/modules/paper-trading/services/position-exits.service.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();await redis.quit();});
test('position exit edits validate state, preserve completed legs and restore current strategy levels',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const uri=new URL(env.MONGODB_URI);uri.pathname=`/quantforge_test_${randomUUID().replaceAll('-','')}`;await mongoose.connect(uri.toString());
 mock.method(redis,'get',async(key:string)=>key==='quantforge:paper:exit-controls'?'1':null);mock.method(redis,'publish',async()=>0);
 try{
  const sessionId=randomUUID(),id=sessionId+':NSE:1',at='2026-10-08T04:00:00Z';
  await PaperSessionModel.create({_id:sessionId,strategyId:sessionId,strategy:{risk:{}},active:true,mode:'automatic',entriesPaused:false,revision:1});
  await PaperPositionModel.create({_id:id,sessionId,instrumentId:'NSE:1',symbol:'TEST',openedAt:at,quantity:6,initialQuantity:10,entryPaise:10000,stopPaise:10000,targetPaise:12000,targets:[{pricePaise:11000,quantity:4,completed:true,filledQuantity:4},{pricePaise:12000,quantity:6,completed:false}]});
  const request={expectedOpenedAt:at,expectedRevision:0,expectedQuantity:6,expectedStopPaise:10000,action:'edit',stop:95,targets:[110,125],acknowledgeRisk:true};
  await assert.rejects(modifyPositionExits(id,{...request,targets:[111,125]}),/completed target/);
  await assert.rejects(modifyPositionExits(id,{...request,acknowledgeRisk:false}),/acknowledge/);
  const edited=await modifyPositionExits(id,request);assert.equal(edited.stopPaise,9500);assert.equal(edited.exitControl!.strategyStopPaise,10000);assert.equal(edited.targets![1].pricePaise,12500);assert.equal(edited.quantity,6);
  assert.equal((await PaperSessionModel.findById(sessionId))!.entriesPaused,true);
  await assert.rejects(modifyPositionExits(id,request),/changed/);
  await PaperPositionModel.updateOne({_id:id},{$set:{'exitControl.strategyStopPaise':10500}});
  const restored=await modifyPositionExits(id,{...request,action:'restore',expectedRevision:1,expectedStopPaise:9500,expectedStrategyStopPaise:10500});
  assert.equal(restored.stopPaise,10500);assert.equal(restored.targets![0].filledQuantity,4);assert.equal(restored.targets![1].pricePaise,12000);assert.equal(restored.exitControl!.stopOverridden,false);
  assert.equal(await PaperExitAmendmentModel.countDocuments({positionId:id}),2);
  await PaperOrderModel.create({_id:randomUUID(),sessionId,instrumentId:'NSE:1',status:'pending',side:'SELL',source:'protection'});
  await assert.rejects(modifyPositionExits(id,{...request,expectedRevision:2,expectedStopPaise:10500}),/already waiting/);
 }finally{mock.restoreAll();assert.ok(mongoose.connection.name.startsWith('quantforge_test_'));await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
