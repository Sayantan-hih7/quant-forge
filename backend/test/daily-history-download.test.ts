import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadDailyWindows,monthlyWindows} from '../src/modules/market-data/services/daily-history-download.js';
import type {Instrument} from '../src/modules/market-data/types.js';
import {jobs,redis} from '../src/shared/redis.js';
const stock={_id:'NSE:1',securityId:'1',exchange:'NSE'} as Instrument;
const raw=(date:string,conflict=false)=>({timestamp:[Date.parse(date)/1000,...(conflict?[Date.parse(date)/1000]:[])],open:conflict?[100,101]:[100],high:conflict?[102,102]:[102],low:conflict?[99,99]:[99],close:conflict?[100,101]:[100],volume:conflict?[10,10]:[10]});
after(async()=>{await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
test('calendar month partition preserves full months and exclusive endpoints',()=>{
 assert.deepEqual(monthlyWindows('2024-01-15','2024-03-01'),[{from:'2024-01-15',to:'2024-02-01'},{from:'2024-02-01',to:'2024-03-01'}]);
});
test('conflicting long response retries smaller windows and stores valid months only',async()=>{
 const saved:string[]=[];
 await assert.rejects(downloadDailyWindows(stock,'2024-01-01','2024-04-01',async(w)=>{saved.push(w.from);},{},async(_path,data)=>{
  const p=data as {fromDate:string;toDate:string};
  return raw(p.fromDate,p.toDate==='2024-04-01'&&p.fromDate==='2024-01-01'||p.fromDate==='2024-02-01');
 }),/Valid windows were saved/);
 assert.deepEqual(saved,['2024-03-01','2024-01-01']);
});
test('authentication failures do not trigger repeated range splitting',async()=>{
 let calls=0;
 await assert.rejects(downloadDailyWindows(stock,'2021-01-01','2026-01-01',async()=>{throw Error('must not save');},{},async()=>{calls++;throw Error('offline');}),/offline/);
 assert.equal(calls,1);
});
