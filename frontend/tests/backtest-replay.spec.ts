import { test, expect, type Page } from '@playwright/test';
import { replayFixture } from './fixtures/backtestReplay';
import { reportFixture, reportStrategy } from './fixtures/backtestReport';
import { replayTimeline, replayFrame } from '../src/modules/backtesting/utils/replayTimeline';
import { plotIndicator, strategyIndicators } from '../src/modules/stock-details/utils/chartIndicators';
import { barEnd } from '../src/modules/stock-details/utils/chartTime';

test('replay reveals open before OHLC, updates partial quantity and applies raised stop next bar', () => {
  const view = replayFixture(), timeline = replayTimeline(view,'2026-09-01T09:15:00+05:30');
  expect(timeline.missingEvents).toBe(0);
  const at = (kind: string) => timeline.steps.findIndex(s => s.event?.kind === kind);
  const entry = replayFrame(timeline.bars,timeline.steps,at('entry'))!;
  expect(entry.bars.at(-1)).toMatchObject({time:'2026-09-01',open:100,high:100,low:100,close:100,volume:0});
  expect(entry.quantity).toBe(10); expect(entry.markers.map(m=>m.side)).toEqual(['BUY','BUY']);
  expect(entry.realized).toBe(0); expect(entry.stop).toBe(96);
  const close = replayFrame(timeline.bars,timeline.steps,at('entry')+1)!;
  expect(close.bars.at(-1)).toMatchObject({high:101,low:96.5,close:99.5,volume:4567});
  const stop = replayFrame(timeline.bars,timeline.steps,at('stop'))!;
  expect(stop).toMatchObject({quantity:6,realized:31,stop:96,pendingStop:100});
  expect(stop.levels.filter(l=>l.kind==='target').map(l=>l.label)).toEqual(['T2']);
  expect(replayFrame(timeline.bars,timeline.steps,at('stop')+1)).toMatchObject({stop:100,pendingStop:undefined,quantity:6});
  const final = replayFrame(timeline.bars,timeline.steps,timeline.steps.length-1)!;
  expect(final).toMatchObject({quantity:0,realized:126}); expect(final.bars.at(-1)?.time).toBe('2026-09-03');
  expect(final.levels).toEqual([]);
  expect(replayFrame(timeline.bars,timeline.steps,at('entry'))).toEqual(entry);
  // Future changes cannot affect the entry-step EMA.
  const indicator = strategyIndicators(reportStrategy).indicators[0];
  const getLines = () => plotIndicator(indicator,view.frames['1d']!.filter(b=>barEnd(b.time,'1d')<=entry.step.at),entry.bars,'1d',entry.step.at);
  const before = getLines(); view.frames['1d']![6].close = 99999;
  expect(getLines()).toEqual(before); expect(before[0].values.at(-1)?.time).toBe('2026-08-31');
});

test('minute boundary orders prior candle close before next open; missing events stop playback', () => {
  const view = replayFixture(); view.timeframe='1m';
  view.frames={'1m':Array.from({length:4},(_,i)=>({time:new Date(Date.parse('2026-09-01T03:45:00Z')+i*60000).toISOString(),open:100,high:105,low:99,close:104,volume:100}))};
  view.events=view.events.slice(0,2).map(e=>({...e,entryAt:'2026-09-01T03:46:00Z',at:'2026-09-01T03:46:00Z',fillAt:e.kind==='entry'?'2026-09-01T03:46:00Z':undefined}));
  const timeline=replayTimeline(view,view.events[0].entryAt), signal=timeline.steps.findIndex(s=>s.event?.kind==='signal'), entry=timeline.steps.findIndex(s=>s.event?.kind==='entry');
  expect(signal).toBeLessThan(entry); expect(timeline.steps[signal].bar).toBe(0);expect(timeline.steps[entry].bar).toBe(1);
  view.frames['1m']=view.frames['1m']!.slice(1);
  expect(replayTimeline(view,view.events[0].entryAt).missingEvents).toBe(1);
});

async function setup(page: Page, limited = false) {
  const run=reportFixture(), view=replayFixture();
  if(limited){view.source='fills-only';view.events=view.events.filter(e=>e.kind==='entry'||e.kind==='exit');view.warnings=['Signal checks and stop adjustments are unavailable.'];}
  await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:{}}));
  await page.route('**/api/strategies',route=>route.fulfill({json:[reportStrategy]}));
  await page.route('**/api/backtests**',route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.endsWith('/replay')?view:path.endsWith('/chart')?{instrumentId:'NSE:1',timeframe:'1d',bars:view.frames['1d'],source:'Stored backtest history',refreshedAt:view.preparedAt}:path.endsWith('/universe')?{stocks:[],listCount:0}:path.endsWith(run._id)?run:[run]});
  });
  await page.goto(`/strategies?tab=backtests&rule=${run.strategy._id}`);
  await page.getByRole('tab',{name:/Run history/}).click();
  await page.getByRole('button',{name:'View report',exact:true}).click();
  await page.getByRole('tab',{name:/Stocks \(/}).click();
  await page.getByRole('button',{name:'View ALPHA chart'}).click();
  await page.getByRole('button',{name:'Replay trade',exact:true}).click();
  return page.getByRole('region',{name:'Trade replay',exact:true});
}

test('playback explains signals, hides future outcomes, steps exits and restores normal report without writes',async({page})=>{
  const errors:string[]=[], writes:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')writes.push(r.url());});
  const replay=await setup(page), why=replay.getByRole('region',{name:'Why this happened'}), metrics=replay.getByLabel('Position at this step');
  await expect(why).toContainText('BUY rule matched');await expect(why).toContainText('85.91');
  await expect(page.getByRole('region',{name:'Backtest trade history'})).toBeHidden();
  await expect(page.locator('.bt-stock-metrics')).toBeHidden();
  await replay.getByRole('button',{name:'Entry',exact:true}).click();
  await expect(why).toContainText('Bought 10 shares at ₹100.00');
  await expect(replay.locator('.stock-chart-ohlc')).toContainText('V 0');
  await expect(replay.getByLabel('Replay indicators')).not.toContainText('100.17');
  await replay.getByRole('button',{name:'Next replay step'}).click();
  await expect(replay.locator('.stock-chart-ohlc')).toContainText('L 96.50');
  await replay.getByRole('button',{name:'Next exit',exact:true}).click();
  await expect(why).toContainText('Target 1');await expect(metrics).toContainText('Shares held6');await expect(metrics).toContainText('₹31.00');
  await replay.getByRole('button',{name:'Next replay step'}).click();
  await expect(why).toContainText('Stop moves from ₹96.00 to ₹100.00');
  await expect(metrics).toContainText('Next candle: ₹100.00');
  await replay.getByRole('button',{name:'Next candle',exact:true}).click();await expect(metrics).toContainText('Active stop₹100.00');
  await replay.getByRole('button',{name:'Next exit',exact:true}).click();
  await expect(metrics).toContainText('₹126.00');await expect(replay).toContainText('Replay finished');
  await expect(replay.getByRole('button',{name:'Next replay step'})).toBeDisabled();
  await replay.getByRole('button',{name:'Signal',exact:true}).click();await expect(metrics).toContainText('Not entered');await expect(metrics).not.toContainText('₹126.00');
  await replay.getByRole('button',{name:'Play',exact:true}).click();await expect(replay.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await expect(why).toContainText('Candle opens');
  await replay.getByRole('button',{name:'Pause',exact:true}).click();
  await page.screenshot({path:'.tools/backtest-replay-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.getByRole('dialog').last().evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'.tools/backtest-replay-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Close replay',exact:true}).click();
  await page.getByRole('dialog').last().getByText('Trade history', { exact:true }).click();
  await expect(page.getByRole('region',{name:'Backtest trade history'})).toBeVisible();expect(errors).toEqual([]);expect(writes).toEqual([]);
});

test('legacy fallback is explicit and disables unknown signal jump in dark mode',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  const replay=await setup(page,true);
  await expect(replay).toContainText('Recorded fills only');await expect(replay.getByRole('button',{name:'Signal',exact:true})).toBeDisabled();
  await replay.getByRole('button',{name:'Entry',exact:true}).click();await expect(replay.getByRole('figure')).toBeVisible();
  await page.screenshot({path:'.tools/backtest-replay-dark.png',fullPage:true});
});
