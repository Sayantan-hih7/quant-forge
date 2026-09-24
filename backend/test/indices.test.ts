import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexInstruments } from '../src/modules/market-indices/config/index-catalog.js';
import { bseDailySnapshot, mergeSnapshots, parseBseChart, parseBseSnapshot, parseNiftySnapshot, parseNseDaily, parseNseSnapshot, sourceTime } from '../src/modules/market-indices/providers/parsers.js';

const now = '2026-09-23T09:30:00.000Z';
const url = 'https://www.nseindia.com/api/allIndices';
const payload = { timestamp: '23-Sep-2026 14:58', data: [
  { index: 'NIFTY 50', last: 101, previousClose: 100, variation: 1, percentChange: 1, open: 99, high: 102, low: 98, yearHigh: 110, yearLow: 90,
    oneWeekAgoVal: 98, oneWeekAgo: '16-Sep-2026', advances: '38', declines: '12', unchanged: '0', pe: '19.72' },
  { index: 'NIFTY 500', last: 501, previousClose: 500, variation: 1, percentChange: 0.2 },
] };

test('exchange parsers preserve identity, missing metrics and IST source time', () => {
  const quotes = parseNseSnapshot(payload,url,now);
  assert.equal(quotes.find(q=>q.id==='nse:nifty-50')?.last,101);
  assert.equal(quotes.find(q=>q.id==='nse:nifty-500')?.last,501);
  assert.equal(quotes[0].asOf,'2026-09-23T09:28:00.000Z');
  assert.deepEqual(quotes[0].references,[{label:'1 week ago',value:98,date:'2026-09-16'}]);
  assert.equal(quotes[0].unchanged,0); assert.equal(quotes[0].pe,19.72);
  assert.equal(quotes.find(q=>q.id==='nse:nifty-500')?.open,null);
  assert.deepEqual(parseNseSnapshot({ ...payload,timestamp:'' },url,now),[]);
  assert.deepEqual(parseNseSnapshot('<html>error</html>',url,now),[]);
  const bse = parseBseSnapshot({Table:[{code:16,LTP:'1,000.25',change:'-10.25',PERCENTCHG:'-1.01',DT_TM:'2026-09-23T14:58:12'}]},url,now);
  assert.equal(bse[0].id,'bse:bse-sensex'); assert.equal(bse[0].previousClose,1010.5);
  assert.equal(bse[0].high,null); assert.equal(bse[0].asOf,'2026-09-23T09:28:12.000Z');
  assert.equal(sourceTime('Wed Sep 23 2026 09:16:59'),'2026-09-23T03:46:59.000Z');
  assert.equal(sourceTime('not a date'),null);
});

test('NSE daily-only indices use dated closing reports, not fabricated intraday ranges', () => {
  const quotes = parseNseDaily('Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%)\nNifty Capital Goods,22-09-2026,-,-,-,100,-2,-1.96',url,now);
  assert.equal(quotes[0].kind,'eod'); assert.equal(quotes[0].last,100); assert.equal(quotes[0].previousClose,102);
  assert.equal(quotes[0].asOf,'2026-09-22T10:00:00.000Z'); assert.equal(quotes[0].high,null);
  assert.equal(quotes[0].points[0].value,100);
});

test('BSE history uses chronological points, excludes indicative auction data and does not trust misleading graph headers', () => {
  const points = parseBseChart('[]#@#'+JSON.stringify([
    {date:'Wed Sep 23 2026 09:01:00',value1:'700'},
    {date:'Wed Sep 23 2026 09:16:59',value:'102'},
    {date:'Wed Sep 23 2026 09:15:59',value:'100'},
  ]),false);
  assert.equal(points.length,2); assert.equal(points[0].value,100);
  const daily = parseBseChart('[{"LatestVal":"999"}]#@#'+JSON.stringify([
    {date:'Mon Sep 21 2026 00:00:00',value:'100'}, {date:'Tue Sep 22 2026 00:00:00',value:'101'},
  ]),true);
  const quote = bseDailySnapshot(indexInstruments.find(i=>i.id==='bse:bse-sensex-50-tmc')!,daily,url,now)!;
  assert.equal(quote.last,101); assert.equal(quote.change,1); assert.equal(quote.asOf,'2026-09-22T10:00:00.000Z');
});

test('cache keeps the last good quote, rejects future data and resets observed charts at the session boundary', () => {
  const [quote] = parseNseSnapshot(payload,url,now);
  const saved = mergeSnapshots([], [quote]);
  assert.equal(saved[0].points.length,1);
  assert.deepEqual(mergeSnapshots(saved, [{...quote,last:1,asOf:'2026-09-22T09:28:00.000Z'}]),saved);
  assert.deepEqual(mergeSnapshots(saved, [{...quote,last:1,asOf:'2026-09-24T09:28:00.000Z'}]),saved);
  assert.equal(mergeSnapshots(saved,[quote])[0].points.length,1);
  const next = mergeSnapshots(saved,[{...quote,asOf:'2026-09-23T09:29:00.000Z',last:102}]);
  assert.equal(next[0].points.length,2);
  assert.equal(mergeSnapshots(next,[{...quote,asOf:'2026-09-24T09:29:00.000Z',fetchedAt:'2026-09-24T09:30:00.000Z'}])[0].points.length,1);
});

test('secondary official NSE source resolves abbreviated trading names by published mapping', () => {
  const quotes = parseNiftySnapshot({data:[{indexName:'NIFTY FIN SERVICE',timeVal:'23-Sep-2026 14:58',last:'105',previousClose:'100',percChange:'5'}]},url,now);
  assert.equal(quotes[0].id,'nse:nifty-financial-services'); assert.equal(quotes[0].change,5);
  assert.equal(quotes[0].source,'NSE Indices website');
  assert.equal(new Set(indexInstruments.map(i=>i.id)).size,114);
});
