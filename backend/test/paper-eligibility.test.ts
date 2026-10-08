import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {stockEligibilityMetrics,eligibilityReasons,eligibilitySettingsSchema} from '../src/modules/backtesting/services/paper-eligibility.js';
import type {BacktestRun} from '../src/modules/backtesting/models/backtest.model.js';
import {jobs,redis} from '../src/shared/redis.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();await redis.quit();});
const fill=(entry:number,exit:number,pnl:number,remainingQuantity=0)=>({instrumentId:'NSE:1',entryAt:`2026-01-${String(entry).padStart(2,'0')}T04:00:00Z`,exitAt:`2026-01-${String(exit).padStart(2,'0')}T05:00:00Z`,pnl,remainingQuantity});
const metrics=(trades:unknown[],openPositions:unknown[]=[])=>stockEligibilityMetrics({config:{ids:['NSE:1','NSE:2']},symbols:{'NSE:1':'ONE'},result:{trades,openPositions}} as unknown as BacktestRun);
test('partial exits form one net position and open positions do not inflate win rate',()=>{
 const [m,empty]=metrics([fill(1,2,100,5),fill(1,3,-120),fill(4,5,40),fill(6,7,90,2)],[{instrumentId:'NSE:1',entryAt:fill(6,7,0).entryAt}]);
 assert.equal(m.closedTrades,2);assert.equal(m.wins,1);assert.equal(m.winRate,50);assert.equal(m.netPnl,20);assert.equal(m.closedDrawdown,20);assert.equal(m.incomplete,false);assert.equal(empty.winRate,null);
});
test('closed drawdown follows exit chronology, includes fees and breakeven in denominator',()=>{
 const [m]=metrics([fill(5,6,-30),fill(1,2,50),fill(7,8,0),fill(3,4,-20)]);
 assert.equal(m.closedDrawdown,50);assert.equal(m.closedTrades,4);assert.equal(m.winRate,25);assert.equal(m.netPnl,0);
 assert.ok(eligibilityReasons(m,{minWinRate:0,minClosedTrades:1,minNetPnl:0}).some(r=>r.includes('positive')));
});
test('filters include minimum sample size and optional closed drawdown',()=>{
 const [m]=metrics([fill(1,2,100),fill(3,4,-10)]);
 assert.deepEqual(eligibilityReasons(m,{minWinRate:50,minClosedTrades:2,minNetPnl:90,maxClosedDrawdown:10}),[]);
 assert.equal(eligibilityReasons(m,{minWinRate:55,minClosedTrades:10,minNetPnl:100,maxClosedDrawdown:9}).length,4);
});
test('invalid records and orphaned partial exits are never qualified',()=>{
 const [m]=metrics([fill(1,2,NaN),fill(3,4,100,2)]);
 assert.equal(m.incomplete,true);assert.equal(m.closedTrades,0);
 assert.ok(eligibilityReasons(m,{minWinRate:0,minClosedTrades:1,minNetPnl:0}).includes('Incomplete or invalid position records'));
});
test('settings reject nonsensical thresholds and unrecognised fields',()=>{
 assert.equal(eligibilitySettingsSchema.parse({criteria:{}}).criteria.minClosedTrades,10);
 for(const criteria of [{minWinRate:101},{minClosedTrades:0},{minNetPnl:-1},{maxClosedDrawdown:0},{unknown:1}])assert.equal(eligibilitySettingsSchema.safeParse({criteria}).success,false);
});
