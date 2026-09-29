import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, PaperSignalModel } from '../src/modules/paper-trading/models/paper.model.js';
import { paperChartContext } from '../src/modules/paper-trading/services/chart-context.service.js';

test('chart context isolates strategy sessions/stocks, exposes partial exits and does not mutate the ledger', {skip:process.env.RUN_DB_TESTS!=='1'}, async()=>{
  const name=`quantforge_test_${randomUUID().replaceAll('-','')}`, uri=new URL(env.MONGODB_URI);uri.pathname=`/${name}`;
  const sessionId=randomUUID(),otherId=randomUUID(),now=new Date().toISOString();
  try {
    await mongoose.connect(uri.toString());
    for(const id of [sessionId,otherId])await PaperSessionModel.create({_id:id,strategyId:id,strategy:{name:id,revision:2},mode:'automatic',cashPaise:990000,initialPaise:1000000,active:true,entriesPaused:false,createdAt:now,revision:1});
    await PaperPositionModel.create({_id:'held',sessionId,instrumentId:'NSE:1',symbol:'TEST',quantity:6,initialQuantity:10,entryPaise:10000,costPaise:60060,stopPaise:10000,targetPaise:11600,initialRiskPaise:400,openedAt:now,breakevenActivated:true,targets:[{pricePaise:10800,quantity:4,completed:true,filledQuantity:4},{pricePaise:11600,quantity:6,completed:false}]});
    for(const [id,sid,instrumentId,status] of [['buy',sessionId,'NSE:1','filled'],['sell',sessionId,'NSE:1','filled'],['other-session',otherId,'NSE:1','filled'],['other-stock',sessionId,'BSE:2','filled'],['pending',sessionId,'NSE:1','pending']] as const) {
      await PaperOrderModel.create({_id:id,sessionId:sid,instrumentId,status,side:id==='sell'?'SELL':'BUY',quantity:id==='sell'?4:10,fillPaise:id==='sell'?10800:10000,source:'signal',createdAt:now,filledAt:status==='filled'?now:undefined,reason:'Fixture'});
    }
    await PaperSignalModel.create({_id:'signal',sessionId,instrumentId:'NSE:1',side:'BUY',barEnd:now,createdAt:now,checks:[],orderId:'buy'});
    const before=JSON.stringify(await PaperOrderModel.find().sort({_id:1}).lean());
    const result=await paperChartContext(sessionId,'NSE:1');
    assert.equal(result.position?.quantity,6);assert.equal(result.position?.stopPaise,10000);
    assert.equal(result.position?.targets?.[0].filledQuantity,4);
    assert.deepEqual(result.fills.map(x=>x._id).sort(),['buy','sell']);assert.equal(result.signals.length,1);assert.equal(result.truncated,false);
    assert.equal(JSON.stringify(await PaperOrderModel.find().sort({_id:1}).lean()),before);
    assert.equal((await paperChartContext(otherId,'NSE:1')).position,null);
    await PaperPositionModel.deleteOne({_id:'held'});
    const closed=await paperChartContext(sessionId,'NSE:1');assert.equal(closed.position,null);assert.equal(closed.fills.length,2);
    await assert.rejects(paperChartContext(randomUUID(),'NSE:1'),/session not found/i);
  } finally {
    if(mongoose.connection.readyState===1&&mongoose.connection.name===name&&/^quantforge_test_[a-f0-9]{32}$/.test(name))await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
