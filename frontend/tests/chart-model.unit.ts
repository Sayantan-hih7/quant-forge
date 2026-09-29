import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicatorValues, plotIndicator } from '../src/modules/stock-details/utils/chartIndicators';
import { liveChart } from '../src/modules/stock-details/utils/liveChart';
import { bucketTime, barEnd } from '../src/modules/stock-details/utils/chartTime';
import { visibleChartEvents } from '../src/modules/stock-details/utils/chartEvents';
import type { ChartBar, StockChartData, StockQuote } from '../src/modules/stock-details/types';
const bar = (time:string,close=100,volume=10):ChartBar => ({time,open:close,high:close+2,low:close-2,close,volume});
const data = (bars:ChartBar[],timeframe:StockChartData['timeframe']='5m'):StockChartData => ({instrumentId:'NSE:1',timeframe,bars,source:'test',refreshedAt:'2026-09-28T04:05:00Z'});
test('indicator seeds match EMA, Wilder RSI/ATR and prior-volume semantics',()=>{
 const bars=Array.from({length:40},(_,i)=>bar(new Date(Date.parse('2026-09-28T03:45:00Z')+i*60000).toISOString(),100+i,i===20?30:10));
 assert.deepEqual(indicatorValues(bars.slice(0,4),'ema',3)[0],[null,null,101.25,102.125]);
 assert.deepEqual(indicatorValues(bars.slice(0,4),'sma',3)[0],[null,null,101,102]);
 assert.equal(indicatorValues(bars,'rsi',14)[0][13],null); assert.equal(indicatorValues(bars,'rsi',14)[0][14],100);
 assert.ok(Math.abs(indicatorValues(bars,'atr',14)[0][13]!-4)<1e-9);
 assert.equal(indicatorValues(bars,'rvol',20)[0][20],3);
 assert.equal(indicatorValues(bars,'macd',14).length,3);
 assert.equal(indicatorValues(bars,'macd',14)[1][32],null); assert.notEqual(indicatorValues(bars,'macd',14)[1][33],null);
 assert.equal(indicatorValues([bar('2026-09-28T03:45:00Z',100),bar('2026-09-28T03:46:00Z',110),bar('2026-09-29T03:45:00Z',200)],'vwap',14)[0][2],200);
});
test('higher timeframe indicators never reveal values before that candle closes',()=>{
 const source=[bar('2026-09-24',100),bar('2026-09-25',110),bar('2026-09-28',120)];
 const target=[bar('2026-09-28T04:00:00.000Z'),bar('2026-09-28T09:55:00.000Z')];
 const i={id:'test',kind:'sma' as const,period:2,timeframe:'1d' as const,strategy:true,color:'blue'};
 assert.deepEqual(plotIndicator(i,source,target,'5m',Date.parse('2026-09-28T09:59:00Z'))[0].values.map(v=>v.value),[105,105]);
 assert.deepEqual(plotIndicator(i,source,target,'5m',Date.parse('2026-09-28T10:01:00Z'))[0].values.map(v=>v.value),[105,115]);
 assert.equal(plotIndicator({...i,offset:1},source,source,'1d',Date.parse('2026-09-28T10:01:00Z'))[0].values.at(-1)?.value,105);
 assert.equal(bucketTime(Date.parse('2026-09-28T09:00:00Z'),'4h'),'2026-09-28T07:45:00.000Z');
 assert.equal(barEnd('2026-09-28T07:45:00.000Z','4h'),Date.parse('2026-09-28T10:00:00Z'));
});
test('signal close marks its triggering candle; fills mark actual fill time, missing candles stay missing',()=>{
 const bars=[bar('2026-09-28T04:00:00.000Z'),bar('2026-09-28T04:05:00.000Z')];
 const events=[{id:'s',kind:'signal' as const,side:'BUY',at:'2026-09-28T04:05:00Z',label:'Match'},{id:'f',kind:'fill' as const,side:'BUY',at:'2026-09-28T04:05:01Z',label:'Fill'},{id:'old',kind:'fill' as const,side:'SELL',at:'2026-09-25T04:05:01Z',label:'Earlier'}];
 assert.deepEqual(visibleChartEvents(events,bars,'5m').map(e=>[e.id,e.time]),[['s',bars[0].time],['f',bars[1].time]]);
});
test('partial minute previews do not become confirmed candles and provider data supersedes them',()=>{
 const minute={...bar('2026-09-28T04:00:00.000Z',110),instrumentId:'NSE:1',partial:true,updatedAt:'2026-09-28T04:00:40Z'};
 const base=data([],'1m');
 assert.equal(liveChart(base,[minute],undefined,Date.parse('2026-09-28T04:00:45Z')).partial,true);
 assert.equal(liveChart(base,[minute],undefined,Date.parse('2026-09-28T04:01:05Z')).bars.length,0);
 const confirmed=bar(minute.time,115);
 assert.equal(liveChart({...base,bars:[confirmed],baseBars:[confirmed]},[minute],undefined,Date.parse('2026-09-28T04:01:05Z')).bars[0].close,115);
});
test('forming weekly preview sums each daily volume once and stale quotes cannot rewrite confirmed daily bars',()=>{
 const now=Date.parse('2026-09-29T05:00:00Z');
 const quote={instrumentId:'NSE:1',price:120,open:115,high:122,low:113,volume:20,lastTradeAt:new Date(now).toISOString(),source:'dhan-stream'} as StockQuote;
 const monday=bar('2026-09-28',100,10), source={...data([monday],'1w'),baseBars:[monday]};
 const view=liveChart(source,[],quote,now);
 assert.equal(view.bars[0].volume,30);assert.equal(view.bars[0].open,100);assert.equal(view.bars[0].close,120);
 const tuesday=bar('2026-09-29',125,100);
 assert.equal(liveChart({...data([tuesday],'1d'),baseBars:[tuesday]},[],quote,now+86400000).bars[0].close,125);
});
