import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entryAfterExit,entryCutoffMinute,reentryBlock} from '../src/modules/paper-trading/services/entry-safety.js';
import {marketTime,calendarExpiryWarning} from '../src/shared/market-calendar.js';
test('exit after barEnd cannot reuse the old entry signal',()=>{
 assert.equal(entryAfterExit('2026-10-06T08:50:00Z','2026-10-06T08:54:13Z'),false);
 assert.equal(entryAfterExit('2026-10-06T08:55:00Z','2026-10-06T08:54:13Z'),true);
 assert.equal(entryAfterExit('2026-10-06T08:55:00Z','2026-10-06T08:55:00Z'),false);
 assert.equal(entryAfterExit('invalid'),false);
});
test('NSE election holiday is closed but adjacent weekdays remain open',()=>{
 assert.equal(marketTime(Date.parse('2026-01-15T10:00:00+05:30')).tradingDay,false);
 for(const day of ['14','16'])assert.equal(marketTime(Date.parse(`2026-01-${day}T10:00:00+05:30`)).open,true);
});
test('entry cutoff preserves saved legacy strategies and allows earlier cutoff',()=>{
 assert.equal(entryCutoffMinute({overnight:false}),915);
 assert.equal(entryCutoffMinute({overnight:false,entryCutoffMinute:900}),900);
 assert.equal(entryCutoffMinute({overnight:true,entryCutoffMinute:900}),930);
});

test('calendar expiry warns before unknown year and does not invent holidays',()=>{
 assert.equal(calendarExpiryWarning(Date.parse('2026-10-06T08:00:00Z')),undefined);
 assert.match(calendarExpiryWarning(Date.parse('2026-12-15T08:00:00Z'))!,/expires/);
 assert.match(calendarExpiryWarning(Date.parse('2027-01-01T08:00:00Z'))!,/unverified/);
});

test('cooldown boundary and IST day counts are independent of process memory',()=>{
 const risk={reentryCooldownMinutes:15,maxEntriesPerStockPerDay:2};
 assert.match(reentryBlock(risk,'2026-10-07T05:14:59Z','2026-10-07T05:00:00Z',[])!,/cooldown/);
 assert.equal(reentryBlock(risk,'2026-10-07T05:15:00Z','2026-10-07T05:00:00Z',[]),undefined);
 assert.match(reentryBlock(risk,'2026-10-07T05:15:00Z',undefined,['2026-10-06T19:00:00Z','2026-10-07T04:00:00Z'])!,/Daily entry limit/);
 assert.equal(reentryBlock(risk,'2026-10-08T04:00:00Z',undefined,['2026-10-07T04:00:00Z','2026-10-07T05:00:00Z']),undefined);
 assert.equal(reentryBlock({},'2026-10-07T05:01:00Z','2026-10-07T05:00:00Z',[]),undefined);
});

test('NSE auction guard restricts simulation without changing BSE or historical pre-launch sessions',async()=>{
 const {executionOpen,squareOffMinute}=await import('../src/modules/paper-trading/services/execution-session.js');
 const at=Date.parse('2026-10-07T15:15:00+05:30');
 assert.equal(executionOpen('NSE:1',at),false);
 assert.equal(executionOpen('BSE:1',at),true);
 assert.equal(executionOpen('NSE:1',Date.parse('2026-07-30T15:15:00+05:30')),true);
 assert.equal(squareOffMinute('NSE:1',at),910);
 assert.equal(squareOffMinute('BSE:1',at),915);
 assert.equal(entryCutoffMinute({overnight:false},'NSE:1',at),910);
 assert.equal(entryCutoffMinute({overnight:false,entryCutoffMinute:870},'NSE:1',at),870);
});
