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
  expect(trend.slice(0,13).every(v=>v===null)).toBe(true); expect(trend[13]).toBeCloseTo(101,8);
  const shorterTrend = indicatorValues(bars,'supertrend',10)[0];
  expect(shorterTrend[9]).toBeCloseTo(97,8);
  expect(indicatorValues(bars,'accDist',14)[0].every(v=>v===0)).toBe(true);
});

async function setup(page: Page, incomplete = false, warmupOnly=false, readiness: boolean | 'missing' | 'empty' | 'research'=false) {
  const run = reportFixture();
  if(readiness){
    run.config.dataPolicy='ready';
    run.selectionAudit={policy:'ready',requestedIds:[...run.config.ids,'NSE:999'],includedIds:run.config.ids,excluded:[{instrumentId:'NSE:999',reasons:['EMA 21 needs more warm-up history. Choose a later start date.']}],method:'Coverage filtering can bias the tested subset.'};
    run.symbols={...run.symbols,'NSE:999':'NEWSTOCK'};
  }
  if(readiness==='research'){run.config.dataPolicy='all';run.selectionAudit!.policy='all';run.selectionAudit!.includedIds=[];}
  if(readiness==='missing')delete run.selectionAudit;
  if(readiness==='empty'){run.status='failed';run.message='No selected stocks have enough data';delete run.result;run.selectionAudit!.includedIds=[];}
  if(warmupOnly){run.result!.unavailableDecisions=5;run.result!.warmupDecisions=5;run.result!.unreadyInstruments=[];}
  if(incomplete)run.result!.historyQuality={sessionsChecked:1,incompleteSessions:1,missingMinutes:1,missingExitSessions:0,affected:[]};
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
  await page.getByRole('tab',{name:/Run history/}).click();
  await page.getByRole('button',{name:'View report',exact:true}).click();
}

test('stock results open historical chart and trade details without writes; empty stocks and mobile remain usable',async({page})=>{
  const errors:string[]=[],writes:string[]=[],chartRequests:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/')){if(r.method()!=='GET')writes.push(r.url());if(r.url().includes('/chart'))chartRequests.push(r.url());}});
  await setup(page);
  await expect(page.getByRole('tab',{name:'Summary',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:/Stocks \(/}).click();
  const results=page.getByRole('region',{name:'Stock-wise backtest results'});
  await expect(results).toContainText('50.0%'); await expect(results).toContainText('167.40');
  await results.getByRole('button',{name:'View ALPHA chart'}).click();
  const drawer=page.getByRole('dialog').last();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(drawer.getByRole('figure')).toBeVisible();
  await drawer.getByRole('button',{name:'Focus chart',exact:true}).click();
  await expect(drawer.locator('.bt-embedded-inspection--expanded')).toBeVisible();
  await drawer.getByRole('button',{name:'Exit chart focus',exact:true}).click();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('EMA 5 · 1d · Strategy');
  await expect.poll(() => drawer.locator('.stock-chart-canvas').evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(240);
  await drawer.getByText('Trade history', { exact:true }).click();
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
  await drawer.getByRole('button',{name:'Back to stock results',exact:true}).click();
  await results.getByRole('button',{name:'View NOTRADE chart'}).click();
  await page.getByRole('dialog').last().getByText('Trade history', { exact:true }).click();
  await expect(page.getByText('No trades were executed for this stock during the test period.')).toBeVisible();
  expect(errors).toEqual([]); expect(writes).toEqual([]);
});

test('stock report and chart retain readable layout in dark mode',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  await setup(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect.poll(()=>page.getByRole('dialog').last().evaluate(el=>Math.round(el.getBoundingClientRect().x))).toBe(0);
  await page.screenshot({path:'.tools/backtest-report-dark.png'});
  await page.getByRole('tab',{name:/Stocks \(/}).click();
  await page.getByRole('button',{name:'View ALPHA chart'}).click();
  const drawer=page.getByRole('dialog').last();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(drawer.getByRole('figure')).toBeVisible();
  await expect.poll(()=>drawer.evaluate(el=>Math.round(el.getBoundingClientRect().x))).toBe(0);
  await page.screenshot({path:'.tools/backtest-chart-dark.png'});
});


test('incomplete history is clearly labelled and cannot hand off to paper trading',async({page})=>{
  await setup(page,true);
  await expect(page.getByText('Completed - data incomplete',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Use for paper trading',exact:true})).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByText('Historical candles have gaps',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'View details',exact:true}).click();
  await expect(page.getByText('Historical candles have gaps',{exact:true})).toBeVisible();
});

 test('completed initial warm-up is explained without treating it as a broken report',async({page})=>{
 await setup(page,false,true);
 await expect(page.getByText('5 initial entry checks waited for indicator warm-up',{exact:true})).not.toBeVisible();
 await page.getByRole('tab',{name:'Data & settings',exact:true}).click();
 await page.getByText('Skipped trades & execution notes',{exact:true}).click();
 await expect(page.getByText('5 initial entry checks waited for indicator warm-up',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Use for paper trading',exact:true})).toBeEnabled();
 });

test('setup and history are separate, retaining date edits when switching',async({page})=>{
 await setup(page);
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('tab',{name:'New backtest',exact:true}).click();
 await expect(page.getByText('View saved rules, risk & costs',{exact:true})).toBeVisible();
 const from=page.getByLabel('From',{exact:true});
 await from.fill('2026-09-02');
 await page.getByRole('tab',{name:/Run history/}).click();
 await expect(from).not.toBeVisible();
 await expect(page.getByRole('button',{name:'View report',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'New backtest',exact:true}).click();
 await expect(from).toHaveValue('2026-09-02');
});


test('readiness exclusions stay visible without changing qualification or trading',async({page})=>{
 const writes:string[]=[];
 page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')writes.push(r.url());});
 await setup(page,false,false,true);
 await expect(page.getByRole('dialog').last()).toContainText('1 stocks excluded before replay');
 await page.getByRole('tab',{name:'Data & settings',exact:true}).click();
 const audit=page.getByRole('region',{name:'Backtest stock readiness'});
 await expect(audit).toContainText('NEWSTOCK');
 await expect(audit).toContainText('Choose a later start date');
 await expect(audit).toContainText('They remain in qualification');
 expect(writes).toEqual([]);
});


test('unaudited worker report blocks paper handoff',async({page})=>{
 await setup(page,false,false,'missing');
 await expect(page.getByRole('button',{name:'Use for paper trading',exact:true})).toBeDisabled();
 await page.getByRole('tab',{name:'Data & settings',exact:true}).click();
 await expect(page.getByText('Readiness audit unavailable', {exact:true})).toBeVisible();
});

test('failed empty scope still opens its exclusion audit',async({page})=>{
 await setup(page,false,false,'empty');
 const audit=page.getByRole('region',{name:'Backtest stock readiness'});
 await expect(audit).toContainText('0 passed initial readiness');
 await expect(audit).toContainText('NEWSTOCK');
});

test('research scope shows retained stocks and warnings instead of exclusions',async({page})=>{
 await setup(page,false,false,'research');
 await page.getByRole('tab',{name:'Data & settings',exact:true}).click();
 const audit=page.getByRole('region',{name:'Backtest stock readiness'});
 await expect(audit).toContainText('stocks retained for research');
 await expect(audit).toContainText('with readiness warnings');
 await expect(audit).not.toContainText('Stocks with issues were excluded');
});
