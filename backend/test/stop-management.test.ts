import {protectiveTrigger} from '../src/modules/paper-trading/services/protection.js';
import type {LiveQuote} from '../src/modules/market-feed/types/feed.types.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { riskSchema, type Risk } from '../src/modules/strategies/validations/strategy.validation.js';
import { advanceStop, initialRiskDistance, exceedsStopLimit } from '../src/modules/paper-trading/services/stop-management.js';
import { positionTargets } from '../src/modules/paper-trading/services/exit-targets.js';
import type { PaperPosition } from '../src/modules/paper-trading/models/paper.model.js';

const risk: Risk = { initialCapital:40000,riskPercent:1,maxPositions:4,timeframe:'1d',stopMode:'price',stopValue:96,stopPercent:4,atrPeriod:14,atrMultiplier:2,targetR:5,overnight:true,slippagePercent:0,feePercent:0,
  exitTargets:[{basis:'risk',value:2,closePercent:30},{basis:'risk',value:4,closePercent:30},{basis:'risk',value:5,closePercent:40}],
  stopManagement:{breakeven:{trigger:'risk',at:1},trailing:{trigger:'target',at:1,distanceR:1}} };
const position=():PaperPosition=>({_id:'p',sessionId:'s',instrumentId:'NSE:1',symbol:'TEST',quantity:100,entryPaise:10000,initialRiskPaise:400,costPaise:1000000,stopPaise:9600,targetPaise:10800,targets:positionTargets(risk,10000,100,400),openedAt:'2026-09-25T05:00:00Z'});

test('signal candle low stays absolute across entry gaps and requires real data',()=>{
  const settings={...risk,stopMode:'candleLow' as const};
  assert.equal(initialRiskDistance(settings,10000,999,96),400);
  assert.equal(initialRiskDistance(settings,10200,999,96),600);
  assert.equal(initialRiskDistance(settings,9500,999,96),-100);
  assert.equal(initialRiskDistance(settings,10000,999),0,'Never fall back to ATR');
});

test('maximum stop distance accepts the boundary and rejects entry gaps without changing the candle low',()=>{
  const settings={...risk,stopMode:'candleLow' as const,maxStopPercent:3};
  for (const [entry,low,exceeded] of [[10000,98,false],[10000,97,false],[10000,96.99,true],[10100,97,true]] as const) {
    const distance=initialRiskDistance(settings,entry,undefined,low);
    assert.equal(exceedsStopLimit(settings,entry,distance),exceeded);
    assert.equal(entry-distance,Math.round(low*100));
  }
  assert.equal(exceedsStopLimit(risk,10000,400),false,'Absent limit preserves earlier revisions');
  assert.equal(riskSchema.safeParse(settings).success,true);
  for(const maxStopPercent of [0,-1,26,Infinity,NaN])assert.equal(riskSchema.safeParse({...settings,maxStopPercent}).success,false);
});
test('per-target stop steps require filled shares and never loosen a higher stop',()=>{
  const settings:Risk={...risk,stopManagement:undefined,exitTargets:risk.exitTargets!.map((t,i)=>({...t,...(i<2?{moveStopTo:i}:{})}))};
  let p=position();
  p={...p,...advanceStop(p,settings,12000)};assert.equal(p.stopPaise,9600);
  p.targets![0].completed=true;p={...p,...advanceStop(p,settings,12000)};assert.equal(p.stopPaise,9600,'Zero shares do not activate');
  p.targets![0].filledQuantity=30;p={...p,...advanceStop(p,settings,12000)};assert.equal(p.stopPaise,10000);
  p.targets![1].filledQuantity=30;p={...p,...advanceStop(p,settings,12000)};assert.equal(p.stopPaise,10800);
  p.stopPaise=11000;p={...p,...advanceStop(p,settings,10900)};assert.equal(p.stopPaise,11000);
  assert.equal(riskSchema.safeParse(settings).success,true);
  for(const [index,moveStopTo] of [[0,1],[1,2],[2,0],[1,-1],[1,.5]]) {
    assert.equal(riskSchema.safeParse({...settings,exitTargets:settings.exitTargets!.map((t,i)=>i===index?{...t,moveStopTo}:t)}).success,false);
  }
});

test('R targets use initial filled-entry risk across fixed, rupee and ATR initial stops',()=>{
  assert.equal(initialRiskDistance(risk,10000),400);
  assert.equal(initialRiskDistance({...risk,stopMode:'amount',stopValue:4},10000),400);
  assert.equal(initialRiskDistance({...risk,stopMode:'fixed'},10000),400);
  assert.equal(initialRiskDistance({...risk,stopMode:'ATR'},10000,2),400);
  assert.equal(initialRiskDistance(risk,9900),300,'A better limit fill changes INITIAL risk');
  assert.deepEqual(position().targets?.map(t=>[t.pricePaise,t.quantity]),[[10800,30],[11600,30],[12000,40]]);
});
test('breakeven can precede target 1 and trailing starts only after a real exit fill',()=>{
  let p=position();
  p={...p,...advanceStop(p,risk,10400)};
  assert.equal(p.stopPaise,10000);assert.equal(p.breakevenActivated,true);assert.equal(p.trailingActivated,undefined);
  p={...p,...advanceStop(p,risk,11000)};
  assert.equal(p.stopPaise,10000,'Touch without target fill does not start target-activated trailing');
  p.targets![0]={...p.targets![0],completed:true,filledQuantity:30};p.quantity=70;
  p={...p,...advanceStop(p,risk,10900)};
  assert.equal(p.stopPaise,10500);assert.equal(p.trailingActivated,true);
  p={...p,...advanceStop(p,risk,11200)};
  assert.equal(p.stopPaise,10800);assert.equal(p.initialRiskPaise,400);
  p={...p,...advanceStop(p,risk,11000)};
  assert.equal(p.stopPaise,10800,'Stop cannot loosen');assert.equal(p.highWaterPaise,11200);
});
test('stop and order validation reject impossible activation settings',()=>{
  assert.equal(riskSchema.safeParse(risk).success,true);
  for(const value of [
    {...risk,stopValue:undefined}, {...risk,entryOrderType:'limit'}, {...risk,entryOrderType:'limit',entryLimitPrice:100.001},
    {...risk,entryOrderType:'limit',entryLimitPrice:95},
    {...risk,stopManagement:{breakeven:{trigger:'target',at:3}}},
    {...risk,stopManagement:{breakeven:{trigger:'target',at:1.5}}},
    {...risk,stopManagement:{trailing:{trigger:'risk',at:1,distanceR:0}}},
    {...risk,breakevenAfterTarget1:true}, {...risk,stopMode:'trailing'},
    {...risk,exitTargets:risk.exitTargets!.map((t,i)=>({...t,value:i?25:2}))},
  ])assert.equal(riskSchema.safeParse(value).success,false);
});

test('manual stop stays fixed while the strategy stop advances for restoration',()=>{
 let p=position();p.stopPaise=9500;p.exitControl={strategyStopPaise:9600,strategyTargetPrices:[10800,11600,12000],stopOverridden:true,targetOverrides:[false,false,false],revision:1,changedAt:p.openedAt};
 p={...p,...advanceStop(p,risk,10400)};assert.equal(p.stopPaise,9500);assert.equal(p.exitControl!.strategyStopPaise,10000);
 p.targets![0]={...p.targets![0],completed:true,filledQuantity:30};
 p={...p,...advanceStop(p,risk,11200)};assert.equal(p.stopPaise,9500);assert.equal(p.exitControl!.strategyStopPaise,10800);
 p.stopPaise=p.exitControl!.strategyStopPaise;p.exitControl!.stopOverridden=false;
 p={...p,...advanceStop(p,risk,11400)};assert.equal(p.stopPaise,11000);
});
test('target overrides do not rewrite strategy stop-step reference prices',()=>{
 const p=position();p.targets![0].pricePaise=11000;p.targets![1].filledQuantity=30;
 p.exitControl={strategyStopPaise:9600,strategyTargetPrices:[10800,11600,12000],stopOverridden:false,targetOverrides:[true,false,false],revision:1,changedAt:p.openedAt};
 const settings={...risk,stopManagement:undefined,exitTargets:risk.exitTargets!.map((t,i)=>({...t,...(i===1?{moveStopTo:1}:{})}))};
 assert.equal(advanceStop(p,settings,11700).stopPaise,10800);
});

test('edited exits ignore previously received quotes but still honour square-off',()=>{
 const p=position();p.exitControl={strategyStopPaise:9600,strategyTargetPrices:[10800,11600,12000],stopOverridden:true,targetOverrides:[false,false,false],revision:1,changedAt:'2026-09-25T05:01:00Z'};
 const q:LiveQuote={instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price:94,cumulativeVolume:100,at:'2026-09-25T05:00:59Z',receivedAt:'2026-09-25T05:00:59Z',source:'dhan',session:'test'};
 assert.equal(protectiveTrigger(p,risk,[q],false).reason,undefined);
 assert.ok(protectiveTrigger(p,risk,[q],true).reason);
 assert.equal(protectiveTrigger(p,risk,[{...q,at:'2026-09-25T05:01:01Z',receivedAt:'2026-09-25T05:01:01Z'}],false).reason,'Stop loss');
});
