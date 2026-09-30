import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossoverMarkers, indicatorFrame, indicatorLabel, indicatorValues, plotIndicator, type ChartIndicator } from '../src/modules/stock-details/utils/chartIndicators';
import { anchorHistoryIssue, indicatorHistoryNeeds, indicatorSettingsSchema, indicatorUnavailable } from '../src/modules/stock-details/utils/indicatorSettings';
import type { ChartBar } from '../src/modules/stock-details/types';
const bar = (time: string, close: number, volume = 10): ChartBar => ({ time, open: close - 1, high: close + 2, low: close - 2, close, volume });
const vwap: ChartIndicator = { id: 'v', kind: 'vwap', period: 14, timeframe: 'chart', color: '#3366aa' };

test('daily session VWAP reproduces the supplied HLC3 example without an intraday restriction', () => {
  const candle = { time: '2026-09-30', open: 140.28, high: 152.58, low: 140.11, close: 150.80, volume: 75929000 };
  const plot = plotIndicator(vwap, [candle], [candle], '1d', Date.parse('2026-09-30T05:48:00Z'));
  assert.equal(plot[0].values[0].value.toFixed(2), '147.83');
  assert.equal(indicatorValues([bar('2026-09-29', 100), candle], 'vwap', 14)[0][1]?.toFixed(2), '147.83');
});
test('VWAP anchors reset by Indian session/week/month and custom anchors exclude earlier bars', () => {
  const bars = [bar('2026-09-25', 100), bar('2026-09-28', 200), bar('2026-09-29', 300, 30), bar('2026-10-01', 400)];
  assert.deepEqual(indicatorValues(bars, 'vwap', 14, { anchor: 'week' })[0], [100,200,275,300]);
  assert.deepEqual(indicatorValues(bars, 'vwap', 14, { anchor: 'month' })[0], [100,150,240,400]);
  assert.deepEqual(indicatorValues(bars, 'vwap', 14, { anchor: 'custom', anchorDate: '2026-09-29' })[0], [null,null,300,325]);
  assert.deepEqual(indicatorValues([bar('2026-09-29', 100, 0)], 'vwap', 14)[0], [null]);
  assert.equal(indicatorFrame(vwap, '1w'), '1d');
});
test('price source, volume SMA and editable study parameters retain independent meanings', () => {
  const bars = Array.from({ length: 40 }, (_, i) => bar(new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10), 100+i, (i+1)*10));
  assert.deepEqual(indicatorValues(bars.slice(0,3), 'volumeSma', 3)[0], [null,null,20]);
  assert.deepEqual(indicatorValues(bars.slice(0,3), 'sma', 3)[0], [null,null,101]);
  assert.deepEqual(indicatorValues(bars.slice(0,3), 'ema', 3, { source: 'open' })[0], [null,null,100.25]);
  assert.deepEqual(indicatorValues(bars, 'bollinger', 3, { multiplier: 3 }).map(v => v[2]), [104,101,98]);
  assert.equal(indicatorValues(bars, 'macd', 14, { fastPeriod: 3, slowPeriod: 5, signalPeriod: 2 })[1][4], null);
  assert.notEqual(indicatorValues(bars, 'macd', 14, { fastPeriod: 3, slowPeriod: 5, signalPeriod: 2 })[1][5], null);
  assert.equal(indicatorValues(bars, 'supertrend', 3, { period: 3, multiplier: 2 })[0][2], 94);
  const line = plotIndicator({ ...vwap, kind: 'volumeSma', period: 3, lineWidth: 3 }, bars, bars, '1d', Date.parse('2026-10-20'))[0];
  assert.equal(line.pane, 'volume'); assert.equal(line.lineWidth, 3);
  assert.equal(indicatorLabel({...vwap,kind:'volumeSma',period:9,source:'close'},'1d'),'Volume SMA 9 · 1d');
});
test('chart edits cannot alter saved strategy calculation settings or expose unclosed source candles', () => {
  const bars = [bar('2026-09-28',100),bar('2026-09-29',110),bar('2026-09-30',200)];
  const config = { ...vwap, kind:'sma' as const, period:2, timeframe:'1d' as const, source:'open' as const, strategy:true };
  const plot = plotIndicator(config,bars,bars,'1d',Date.parse('2026-09-30T05:00:00Z'))[0];
  assert.deepEqual(plot.values,[{time:'2026-09-29',value:105}]);
  assert.deepEqual(plotIndicator({ ...config, visible:false },bars,bars,'1d',Date.now()),[]);
});
test('settings validation rejects ambiguous periods and invalid anchors, history requests reflect study needs', () => {
  assert.equal(indicatorSettingsSchema.safeParse({ ...vwap, kind:'macd', fastPeriod:30,slowPeriod:20 }).success,false);
  assert.equal(indicatorSettingsSchema.safeParse({ ...vwap, anchor:'custom',anchorDate:'2026-02-30' }).success,false);
  assert.equal(indicatorSettingsSchema.safeParse({ ...vwap, anchor:'custom',anchorDate:'2026-09-01' }).success,true);
  const config = { ...vwap, kind:'sma' as const, period:9 };
  const bars = Array.from({length:6},(_,i)=>bar(new Date(Date.UTC(2026,8,25+i)).toISOString().slice(0,10),100));
  assert.equal(indicatorUnavailable(config,'1d',bars,Date.parse('2026-09-30T05:00:00Z')), 'Needs 9 candles · 5 completed + 1 forming');
  const needs = indicatorHistoryNeeds([{...config,period:200,timeframe:'1mo'}, {...vwap,anchor:'custom',anchorDate:'2005-01-01'}],'1d');
  assert.equal(needs['1mo']!.minBars,210); assert.equal(needs['1d']!.from,'2005-01-01');
  const anchored = {...vwap,anchor:'custom' as const,anchorDate:'2026-09-01'};
  const data = { instrumentId:'NSE:1',timeframe:'1d' as const,bars,source:'test',refreshedAt:'2026-09-30' };
  assert.ok(anchorHistoryIssue(anchored,data),'An unverified missing prefix must not generate a false anchored average');
  assert.equal(anchorHistoryIssue(anchored,{...data,historyVerified:true}),undefined,'A verified IPO prefix can legitimately have no earlier bars');
  assert.ok(anchorHistoryIssue(anchored,{...data,historyVerified:true,requestedFrom:'2026-09-20'}),'A provider lookback limit cannot be ignored');
});

test('pivot overlays preserve saved settings, completed source candles and candle offsets', () => {
  const daily=[bar('2026-08-31',100),bar('2026-09-28',200),bar('2026-09-29',220),bar('2026-09-30',240)];
  const target=[bar('2026-09-29T03:45:00Z',200),bar('2026-09-30T03:45:00Z',220)];
  const config:ChartIndicator={...vwap,kind:'pivots',strategy:true,timeframe:'1d',offset:1,pivotType:'camarilla',strategySettings:{pivotFrame:'1d',pivotType:'traditional'}};
  const plots=plotIndicator(config,daily,target,'5m',Date.parse('2026-09-30T05:00:00Z'),undefined,daily);
  assert.deepEqual(plots[0].values,[{time:target[1].time,value:100}]);
  assert.ok(plots[0].label.includes('traditional'));
  assert.ok(indicatorHistoryNeeds([config],'5m')['1d']);
  assert.equal(indicatorSettingsSchema.safeParse({...vwap,kind:'unsupported'}).success,false);
});

test('monthly pivots do not substitute an older month when the previous month is missing', () => {
  const source=[bar('2026-01-30',100),bar('2026-03-02',200)];
  const lines=plotIndicator({...vwap,kind:'pivots',pivotFrame:'1mo'},source,source,'1d',Date.parse('2026-04-01'));
  assert.equal(lines[0].values.length,0);
});

test('new studies use real warmup and average price is an explicit candle formula', () => {
  const bars=Array.from({length:120},(_,i)=>bar(new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),100+i+Math.sin(i)*5));
  assert.equal(indicatorValues(bars,'dema',9)[0].findIndex(v=>v!==null),16);
  assert.equal(indicatorValues(bars,'connorsRsi',3)[0].findIndex(v=>v!==null),101);
  assert.equal(indicatorValues(bars,'averagePrice',14)[0][0],99.75);
  const needs=indicatorHistoryNeeds([{...vwap,kind:'dema',period:200},{...vwap,kind:'connorsRsi',period:3,rankPeriod:500}],'1d');
  assert.ok(needs['1d']!.minBars>=602);
  assert.equal(indicatorSettingsSchema.safeParse({...vwap,kind:'maCross',fastPeriod:30,slowPeriod:20}).success,false);
  assert.equal(indicatorSettingsSchema.safeParse({...vwap,kind:'connorsRsi',rankPeriod:0}).success,false);
});

test('crossovers are marked once on completed candles and honour direction', () => {
  const bars=[1,2,3,4,5].map((v,i)=>bar(`2026-09-${25+i}`,100+v));
  const values=[[null,2,3,1,4],[null,2,2,2,2]];
  const now=Date.parse('2026-09-29T05:00:00Z');
  assert.deepEqual(crossoverMarkers(bars,values,bars,'1d','1d',now).map(m=>[m.time,m.direction]),[['2026-09-27','above'],['2026-09-28','below']]);
  assert.equal(crossoverMarkers(bars,values,bars,'1d','1d',now,'above').length,1);
  const minutes=[bar('2026-09-27T09:55:00Z',100),bar('2026-09-28T09:55:00Z',100)];
  assert.equal(crossoverMarkers(bars,values,minutes,'1d','5m',now).length,2);
});

test('per-line visibility and colours preserve line identity and crossover labels', () => {
  const bars=Array.from({length:50},(_,i)=>bar(new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),100+Math.sin(i)*15));
  const config:ChartIndicator={...vwap,kind:'maCross',fastPeriod:3,slowPeriod:8,lineStyles:{0:{visible:false},1:{color:'#123456'}}};
  const plots=plotIndicator(config,bars,bars,'1d',Date.parse('2026-05-01'));
  assert.equal(plots.length,1);assert.equal(plots[0].id,'v-1');assert.equal(plots[0].color,'#123456');
  assert.ok(plots[0].markers!.length>0);assert.ok(plots[0].markers!.every(m=>!m.label.includes('BUY')));
  assert.equal(plotIndicator({...config,showCrosses:false},bars,bars,'1d',Date.parse('2026-05-01'))[0].markers,undefined);
});
