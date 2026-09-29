import { test, expect, type Page } from '@playwright/test';
import { backtestPositionEvents, backtestStockResults } from '../src/modules/backtesting/utils/stockResults';
import { reportFixture, reportStrategy } from './fixtures/backtestReport';
import { indicatorValues, strategyIndicators } from '../src/modules/stock-details/utils/chartIndicators';

test('stock P&L reconciles, counts partial exits once, and excludes open positions from win rate', () => {
  const run = reportFixture(), stocks = backtestStockResults(run), alpha = stocks.find(s => s.symbol === 'ALPHA')!;
  expect(alpha).toMatchObject({ totalTrades: 3, closedTrades: 2, wins: 1, losses: 1, winRate: 50, realizedPnl: 126, unrealizedPnl: 41.4, totalPnl: 167.4 });
  expect(stocks.find(s => s.symbol === 'DELTA')).toMatchObject({ totalTrades: 1, closedTrades: 1, wins: 0, losses: 1, winRate: 0, totalPnl: -20 });
  expect(stocks.find(s => s.symbol === 'BETA')).toMatchObject({ closedTrades: 0, winRate: null, totalPnl: -51 });
  expect(stocks.reduce((sum,s) => sum + s.totalPnl, 0)).toBeCloseTo(run.result!.netPnl, 2);
  expect(backtestPositionEvents(alpha.positions[0]).map(e => e.side)).toEqual(['BUY','SELL','SELL']);
  expect(strategyIndicators(run.strategy).indicators).toContainEqual(expect.objectContaining({kind:'ema',period:5,timeframe:'1d'}));
  const legacy = structuredClone(run); delete legacy.result!.openPositions[0].entryAt;
  expect(backtestStockResults(legacy)[0]).toMatchObject({totalTrades:3,closedTrades:2,winRate:50,totalPnl:167.4});
  // Equivalent ISO representations must still join the partial entry and open position.
  run.result!.openPositions[0].entryAt = '2026-09-21T09:15:00+05:30';
  expect(backtestStockResults(run)[0].totalTrades).toBe(3);
});

test('new chart indicators have correct seeds, bands, panes and trend direction', () => {
  const bars = Array.from({length:60},(_,i) => ({time:`2026-08-${String(i+1).padStart(2,'0')}`,open:100+i,close:100+i,high:102+i,low:98+i,volume:1000}));
  const bands = indicatorValues(bars, 'bollinger', 3);
  expect(bands.map(s=>s[2])).toEqual([103,101,99]);
  const adx = indicatorValues(bars,'adx',14)[0];
  expect(adx.slice(0,26).every(v=>v===null)).toBe(true); expect(adx[26]).toBeCloseTo(100,8);
  const trend = indicatorValues(bars,'supertrend',14)[0];
  expect(trend.slice(0,9).every(v=>v===null)).toBe(true); expect(trend[9]).toBeCloseTo(97,8);
  expect(indicatorValues(bars,'accDist',14)[0].every(v=>v===0)).toBe(true);
});

async function setup(page: Page) {
  const run = reportFixture();
  await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().endsWith('/session')?{authenticated:true,mode:'local'}:{}}));
  await page.route('**/api/strategies',route=>route.fulfill({json:[reportStrategy]}));
  await page.route('**/api/backtests**',route=>{
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/chart')) {
      const timeframe = url.searchParams.get('timeframe')??'1d';
      const bars = Array.from({length:270},(_,i)=>({time:new Date(Date.parse('2026-01-01T00:00:00Z')+i*86400000).toISOString().slice(0,10),open:100,high:120,low:95,close:100+i/100,volume:1000}));
      return route.fulfill({json:{instrumentId:'NSE:1',timeframe,bars,source:'Stored backtest history',refreshedAt:'2026-09-28T04:30:00Z'}});
    }
    return route.fulfill({json:url.pathname.endsWith('/universe')?{stocks:[],listCount:0}:url.pathname.endsWith(run._id)?run:[run]});
  });
  await page.goto(`/strategies?tab=backtests&rule=${run.strategy._id}`);
  await page.getByRole('button',{name:'View report',exact:true}).click();
}

test('stock results open historical chart and trade details without writes; empty stocks and mobile remain usable',async({page})=>{
  const errors:string[]=[],writes:string[]=[],chartRequests:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/')){if(r.method()!=='GET')writes.push(r.url());if(r.url().includes('/chart'))chartRequests.push(r.url());}});
  await setup(page);
  const results=page.getByRole('region',{name:'Stock-wise backtest results'});
  await expect(results).toContainText('50.0%'); await expect(results).toContainText('167.40');
  await results.getByRole('button',{name:'View ALPHA chart'}).click();
  const drawer=page.getByRole('dialog').last();
  await expect(drawer.getByRole('figure')).toBeVisible();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('EMA 5 · 1d · Strategy');
  const history=drawer.getByRole('region',{name:'Backtest trade history'});
  await expect(history.getByText('Win',{exact:true})).toBeVisible();
  await expect(history.getByText('Loss',{exact:true})).toBeVisible();
  await history.getByRole('button',{name:'Expand row'}).first().click();
  await history.getByRole('button',{name:'Target 2',exact:true}).click();
  await expect(drawer.getByText('SELL backtest fill · 6 shares at ₹116.00',{exact:true})).toBeVisible();
  await page.screenshot({path:'.tools/backtest-stock-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>drawer.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'.tools/backtest-stock-mobile.png'});
  expect(chartRequests.length).toBeGreaterThan(0); expect(chartRequests.every(url=>url.includes('/backtests/'))).toBe(true);
  await drawer.getByRole('button',{name:'Close',exact:true}).click();
  await results.getByRole('button',{name:'View NOTRADE chart'}).click();
  await expect(page.getByText('No trades were executed for this stock during the test period.')).toBeVisible();
  expect(errors).toEqual([]); expect(writes).toEqual([]);
});

test('stock report and chart retain readable layout in dark mode',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  await setup(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect.poll(()=>page.getByRole('dialog').last().evaluate(el=>Math.round(el.getBoundingClientRect().x))).toBe(320);
  await page.screenshot({path:'.tools/backtest-report-dark.png'});
  await page.getByRole('button',{name:'View ALPHA chart'}).click();
  const drawer=page.getByRole('dialog').last();
  await expect(drawer.getByRole('figure')).toBeVisible();
  await expect.poll(()=>drawer.evaluate(el=>Math.round(el.getBoundingClientRect().x))).toBe(200);
  await page.screenshot({path:'.tools/backtest-chart-dark.png'});
});
