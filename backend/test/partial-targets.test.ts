import test from 'node:test';
import assert from 'node:assert/strict';
import { riskSchema, type Risk } from '../src/modules/strategies/validations/strategy.validation.js';
import { InvalidTargetPriceError, positionTargets } from '../src/modules/paper-trading/services/exit-targets.js';
import { protectiveTrigger } from '../src/modules/paper-trading/services/protection.js';
import type { PaperPosition } from '../src/modules/paper-trading/models/paper.model.js';
import type { LiveQuote } from '../src/modules/market-feed/types/feed.types.js';

const risk:Risk={initialCapital:100000,riskPercent:1,maxPositions:4,timeframe:'1d',stopMode:'fixed',stopPercent:2,atrPeriod:14,atrMultiplier:2,targetR:2,overnight:true,slippagePercent:0,feePercent:0,exitTargets:[{profitPercent:2,closePercent:50},{profitPercent:4,closePercent:50}],breakevenAfterTarget1:true};

test('percentage, rupee gain and exact price resolve correctly against actual entry',()=>{
  const plan=(basis:'amount'|'price',values:number[]):Risk=>({...risk,exitTargets:values.map(value=>({basis,value,closePercent:50}))});
  assert.deepEqual(positionTargets(risk,50000,11)?.map(t=>t.pricePaise),[51000,52000]);
  assert.deepEqual(positionTargets(plan('amount',[10,20]),50000,11)?.map(t=>t.pricePaise),[51000,52000]);
  assert.deepEqual(positionTargets(plan('price',[510,520]),50000,11)?.map(t=>t.pricePaise),[51000,52000]);
  assert.deepEqual(positionTargets(plan('amount',[10,20]),60000,11)?.map(t=>t.pricePaise),[61000,62000]);
  assert.throws(()=>positionTargets(plan('price',[510,520]),51000,11),InvalidTargetPriceError);
  assert.throws(()=>positionTargets(risk,1,11),InvalidTargetPriceError,'Paise rounding cannot create identical targets');
});

test('currency targets reject mixed units, ambiguous fields, missing values and sub-paise precision',()=>{
  const first={basis:'amount',value:10,closePercent:50}, second={basis:'amount',value:20,closePercent:50};
  assert.equal(riskSchema.safeParse({...risk,exitTargets:[first,second]}).success,true);
  for(const invalid of [
    [{...first,basis:'price'},second], [{...first,profitPercent:2},second],
    [{...first,value:undefined},second], [{...first,value:10.001},second],
    [{...first,basis:'percent'},second], [{...first,value:20},second], [{...first,value:0},second],
  ])assert.equal(riskSchema.safeParse({...risk,exitTargets:invalid}).success,false);
});

test('partial risk validates allocation, ordering, count and legacy single targets',()=>{
  assert.equal(riskSchema.safeParse(risk).success,true);
  assert.equal(riskSchema.safeParse({...risk,exitTargets:undefined,breakevenAfterTarget1:undefined}).success,true);
  for(const invalid of [
    {...risk,exitTargets:[{profitPercent:2,closePercent:30},{profitPercent:4,closePercent:50}]},
    {...risk,exitTargets:[{profitPercent:4,closePercent:50},{profitPercent:4,closePercent:50}]},
    {...risk,exitTargets:[{profitPercent:2,closePercent:100}]},
    {...risk,exitTargets:undefined},
  ])assert.equal(riskSchema.safeParse(invalid).success,false);
});

test('rounding preserves total whole shares including tiny and three-target positions',()=>{
  assert.deepEqual(positionTargets(risk,10000,11)?.map(t=>t.quantity),[5,6]);
  assert.deepEqual(positionTargets(risk,10000,1)?.map(t=>({quantity:t.quantity,completed:t.completed})),[{quantity:0,completed:true},{quantity:1,completed:false}]);
  const three={...risk,exitTargets:[{profitPercent:2,closePercent:33},{profitPercent:4,closePercent:33},{profitPercent:6,closePercent:34}]};
  assert.deepEqual(positionTargets(three,10000,7)?.map(t=>t.quantity),[2,2,3]);
});

test('only the next unfilled target triggers; stops and session close exit the remainder',()=>{
  const p:PaperPosition={_id:'p',sessionId:'s',instrumentId:'NSE:1',symbol:'TEST',quantity:5,initialQuantity:10,costPaise:50000,entryPaise:10000,stopPaise:10000,targetPaise:10400,targets:positionTargets(risk,10000,10),openedAt:'2026-09-25T04:00:00Z'};
  p.targets![0].completed=true;
  const q:LiveQuote={instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price:103,at:'2026-09-25T05:00:00Z',receivedAt:'2026-09-25T05:00:00Z',cumulativeVolume:1000,source:'dhan',session:'test'};
  assert.equal(protectiveTrigger(p,risk,[q],false).reason,undefined);
  assert.equal(protectiveTrigger(p,risk,[{...q,price:110}],false).targetIndex,1);
  assert.equal(protectiveTrigger(p,risk,[{...q,price:99}],false).reason,'Stop loss');
  assert.equal(protectiveTrigger(p,risk,[{...q,price:110}],true).reason,'Session close');
});
