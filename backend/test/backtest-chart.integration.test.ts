import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { CandleModel } from '../src/modules/market-data/models/market-data.model.js';
import { BacktestRunModel } from '../src/modules/backtesting/models/backtest.model.js';
import { backtestStockChart, completedReviewBars } from '../src/modules/backtesting/services/chart.service.js';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';

test('chart review omits incomplete minutes and forming weekly/monthly bars',()=>{
  const start=Date.parse('2026-09-21T03:45:00Z');
  const minutes=Array.from({length:15},(_,i)=>i).filter(i=>i!==2).map(i=>({time:new Date(start+i*60000).toISOString(),open:100,high:110,low:95,close:105,volume:10}));
  const result=completedReviewBars(minutes,'5m',start+12*60000);
  assert.equal(result.incompleteBuckets,1);assert.equal(result.bars.length,1);assert.equal(result.bars[0].volume,50);
  assert.equal(completedReviewBars(minutes.slice(0,1),'1w',Date.parse('2026-09-24')).bars.length,0);
  assert.equal(completedReviewBars(minutes.slice(0,1),'1mo',Date.parse('2026-09-24')).bars.length,0);
});

test('report chart reads the original period, excludes newer bars and refuses unrelated stocks', {skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
  const name=`quantforge_test_${randomUUID().replaceAll('-','')}`,uri=new URL(env.MONGODB_URI);uri.pathname=`/${name}`;
  try{
    await mongoose.connect(uri.toString());
    const id=randomUUID(),strategy={...researchPresets.find(p=>p.draft.entry.horizon==='swing')!.draft,_id:randomUUID(),revision:1,savedAt:new Date().toISOString()};
    await BacktestRunModel.create({_id:id,strategy,status:'completed',createdAt:new Date().toISOString(),config:{from:'2026-06-01',to:'2026-07-01',ids:['NSE:1'],universe:'current',includeManual:false},snapshots:[]});
    await CandleModel.create(['2026-05-29','2026-06-01','2026-06-30','2026-07-01'].map(day=>({instrumentId:'NSE:1',interval:'1d' as const,time:`${day}T03:45:00.000Z`,open:100,high:110,low:95,close:105,volume:1000,source:'dhan' as const,observedAt:new Date().toISOString()})));
    const chart=await backtestStockChart(id,'NSE:1','1d');
    assert.equal(chart.bars.at(-1)?.time,'2026-06-30');assert.ok(chart.bars.some(b=>b.time==='2026-06-01'));assert.ok(chart.bars.some(b=>b.time==='2026-05-29'));
    assert.equal(chart.source,'Stored backtest history');
    await assert.rejects(backtestStockChart(id,'NSE:2','1d'),/not included/);
    assert.equal(await CandleModel.countDocuments(),4);
  }finally{
    if(mongoose.connection.readyState===1&&mongoose.connection.name===name&&/^quantforge_test_[a-f0-9]{32}$/.test(name))await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
