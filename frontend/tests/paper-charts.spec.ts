import { test, expect, type Page } from '@playwright/test';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
const now = '2026-09-28T04:30:12.000Z';
const strategy = { ...sampleTradingPlan('intraday'), _id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: 3, savedAt: now };
const session = { _id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc', strategy, active:true, mode:'automatic', entriesPaused:false, cashPaise:9990000, initialPaise:10000000, ids:['NSE:1','NSE:2'] };
const quote = {instrumentId:'NSE:1',price:107,previousClose:100,change:7,percent:7,open:100,high:109,low:99,volume:100000,averagePrice:104,lastTradeAt:now,receivedAt:now,source:'dhan-snapshot'};
const position = {_id:'p',sessionId:session._id,instrumentId:'NSE:1',symbol:'CHARTSTOCK',quantity:6,initialQuantity:10,entryPaise:10000,stopPaise:10000,targetPaise:11600,initialRiskPaise:400,breakevenActivated:true,openedAt:'2026-09-28T04:00:01Z',costPaise:60060,targets:[{pricePaise:10800,quantity:4,completed:true,filledQuantity:4},{pricePaise:11600,quantity:6,completed:false}],mark:{pricePaise:10700,valuePaise:64200,unrealizedPaise:4140,at:now,fresh:true,source:'dhan'}};
const fills = [{_id:'buy',sessionId:session._id,instrumentId:'NSE:1',side:'BUY',status:'filled',source:'signal',quantity:10,fillPaise:10000,feePaise:100,createdAt:'2026-09-28T04:00:00Z',filledAt:'2026-09-28T04:00:01Z',reason:'Buy rules matched'}, {_id:'sell',sessionId:session._id,instrumentId:'NSE:1',side:'SELL',status:'filled',source:'protection',quantity:4,fillPaise:10800,feePaise:43,createdAt:'2026-09-28T04:20:00Z',filledAt:'2026-09-28T04:20:01Z',reason:'Target 1'}];
const signal = {_id:'signal',sessionId:session._id,instrumentId:'NSE:1',side:'BUY',barEnd:'2026-09-28T04:00:00Z',referencePrice:100,orderId:'buy',checks:[{field:'ema5',matched:true,left:104,right:102}],message:'EMA momentum matched'};
const paper = {sessions:[session],positions:[position],orders:fills,signals:[signal],symbols:{'NSE:1':'CHARTSTOCK','NSE:2':'SECOND'},workerRunning:true,marketOpen:true,feed:{state:'live',freshIds:['NSE:1','NSE:2']}};
async function setup(page:Page) {
 await page.clock.setFixedTime(new Date(now));
 await page.addInitScript(()=>{
   const feeds:{onmessage:((event:{data:string})=>void)|null;close:()=>void}[]=[];
   Object.assign(window,{chartFeeds:feeds});
   window.EventSource=class {onmessage:((event:{data:string})=>void)|null=null;onerror=null;constructor(){feeds.push(this);}close(){this.onmessage=null;}} as unknown as typeof EventSource;
 });
 await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().endsWith('/session')?{authenticated:true,mode:'local'}:{}}));
 await page.route('**/api/watchlists',route=>route.fulfill({json:{lists:[{_id:'personal',ids:[]}],universeCount:3}}));
 await page.route('**/api/qualification/membership',route=>route.fulfill({json:{month:'2026-09',revision:1,published:true,members:[]}}));
 await page.route('**/api/paper',route=>route.fulfill({json:paper}));
 await page.route('**/api/strategies',route=>route.fulfill({json:[strategy]}));
 await page.route('**/api/paper/orders**',route=>route.fulfill({json:{items:fills,symbols:paper.symbols,hasMore:false,next:null}}));
 await page.route('**/api/paper/sessions/*/stocks/*/chart',route=>route.fulfill({json:{session,position,fills,signals:[signal],truncated:false}}));
 await page.route('**/api/stocks/**',route=>{
   const url=new URL(route.request().url()),id=decodeURIComponent(url.pathname).includes('BSE:10')?'BSE:10':decodeURIComponent(url.pathname).includes('NSE:2')?'NSE:2':'NSE:1';
   const instrument={_id:id,symbol:id==='NSE:2'?'SECOND':'CHARTSTOCK',name:'Chart stock',exchange:id.split(':')[0],isin:id==='NSE:2'?'INE456':'INE123',active:true};
   if(url.pathname.endsWith('/listings'))return route.fulfill({json:{instrument,listings:id==='NSE:2'?[instrument]:[{...instrument,_id:'NSE:1',exchange:'NSE'},{...instrument,_id:'BSE:10',exchange:'BSE'}]}});
   if(url.pathname.endsWith('/quotes'))return route.fulfill({json:{quotes:[{...quote,instrumentId:id}]}});
   if(url.pathname.endsWith('/chart')){
     const timeframe=url.searchParams.get('timeframe')??'1d',daily=['1d','1w','1mo'].includes(timeframe);
     const bars=Array.from({length:daily?250:70},(_,i)=>({time:daily?new Date(Date.parse('2025-12-01T00:00:00Z')+i*86400000).toISOString().slice(0,10):new Date(Date.parse('2026-09-25T03:45:00Z')+i*5*60000).toISOString(),open:100,high:110,low:98,close:102+i/100,volume:1000}));
     if(!daily)for(let i=0;i<9;i++)bars.push({time:new Date(Date.parse('2026-09-28T03:45:00Z')+i*5*60000).toISOString(),open:100,high:110,low:98,close:102,volume:1000});
     return route.fulfill({json:{instrumentId:id,timeframe,bars,source:'fixture',latestCandleAt:bars.at(-1)?.time,refreshedAt:now}});
   }
   return route.fulfill({json:{instrument,facts:[],qualification:null}});
 });
}
test('open position chart displays actual partial exits, moved stop and separate signals without changing orders',async({page},testInfo)=>{
 const errors:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/api/'))writes.push(r.url());});
 await page.addInitScript(()=>{const resizeErrors:string[]=[];Object.assign(window,{resizeErrors});window.addEventListener('error',e=>{if(e.message.includes('ResizeObserver'))resizeErrors.push(e.message);});});
 await setup(page);await page.goto('/paper-trading');await page.getByRole('button',{name:'View CHARTSTOCK chart'}).click();
 const drawer=page.getByRole('dialog');await expect(drawer.getByRole('figure')).toBeVisible();
 await drawer.locator('.stock-chart-canvas').hover({position:{x:120,y:80}});
 await expect(drawer.getByText(/Indicator values · crosshair at/)).toBeVisible();
 await expect(drawer.getByText('6 / 10',{exact:true})).toBeVisible();
 await expect(drawer.getByText('Current stop ₹100.00',{exact:true})).toBeVisible();
 await expect(drawer.getByText('Initial stop ₹96.00',{exact:true})).toBeVisible();
 await expect(drawer.getByText('T2 · 6 shares ₹116.00',{exact:true})).toBeVisible();
 await expect(drawer.getByText('₹31.17',{exact:true})).toBeVisible();
 await drawer.getByRole('button',{name:'SELL paper fill',exact:true}).click();
 await expect(drawer.getByText('SELL paper fill · 4 shares at ₹108.00',{exact:true})).toBeVisible();
 await drawer.getByRole('button',{name:'Indicators',exact:true}).click();
 await page.getByRole('checkbox',{name:'Show strategy indicators',exact:true}).uncheck();
 await page.getByRole('button',{name:'Configure indicator',exact:true}).click();
 await page.getByRole('dialog',{name:'EMA settings'}).getByLabel('Period (candles)').fill('21');
 await page.getByRole('dialog',{name:'EMA settings'}).getByRole('button',{name:'Add to chart'}).click();
 await expect(drawer.getByLabel('Visible indicators')).toContainText('EMA 21 · 5m');
 await drawer.getByRole('button',{name:'Indicators',exact:true}).click();
 await page.getByRole('button',{name:'Remove EMA 21'}).click();
 await page.getByRole('checkbox',{name:'Show strategy indicators',exact:true}).check();
 await drawer.getByRole('heading',{name:'Price & volume'}).click();
 await drawer.getByRole('button',{name:'Expand stock details'}).click();
 await page.screenshot({path:testInfo.outputPath('paper-chart-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>drawer.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await drawer.getByText('Line',{exact:true}).click();await expect(drawer.getByRole('figure')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('paper-chart-mobile.png')});
 expect(await page.evaluate(()=>(window as unknown as {resizeErrors:string[]}).resizeErrors)).toEqual([]);
 expect(errors).toEqual([]);expect(writes).toEqual([]);
});

test('alternate exchange comparison hides original paper fills and restores them on return without orders',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/api/'))writes.push(r.url());});
 await setup(page);await page.goto('/paper-trading');await page.getByRole('button',{name:'View CHARTSTOCK chart'}).click();
 const drawer=page.getByRole('dialog');await expect(drawer.getByText('6 / 10',{exact:true})).toBeVisible();
 await drawer.getByLabel('Stock exchange').getByText('BSE',{exact:true}).click();
 await expect(drawer.getByText('Comparing BSE prices',{exact:true})).toBeVisible();
 await expect(drawer.getByRole('figure')).toBeVisible();
 await expect(drawer.getByText('6 / 10',{exact:true})).toHaveCount(0);
 await expect(drawer.getByText('Current stop ₹100.00',{exact:true})).toHaveCount(0);
 await expect(drawer.getByRole('checkbox',{name:'Trades & signals',exact:true})).toHaveCount(0);
 await expect(drawer.getByRole('button',{name:'SELL paper fill',exact:true})).toHaveCount(0);
 await drawer.getByRole('button',{name:'Back to NSE trade',exact:true}).click();
 await expect(drawer.getByText('6 / 10',{exact:true})).toBeVisible();
 await expect(drawer.getByText('Current stop ₹100.00',{exact:true})).toBeVisible();
 await expect(drawer.getByRole('checkbox',{name:'Trades & signals',exact:true})).toBeChecked();
 expect(writes).toEqual([]);
});

test('related-company research hides the original paper trade and restores it on return', async ({ page }) => {
 const errors:string[]=[],writes:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(['POST','PATCH','DELETE'].includes(request.method())&&request.url().includes('/api/'))writes.push(request.url());});
 await setup(page);
 await page.route('**/api/stocks/*/related',route=>route.fulfill({json:{sector:'Industrials',ordering:'alphabetical',items:[{_id:'NSE:2',symbol:'SECOND',name:'Second company',exchange:'NSE',isin:'INE456',active:true,marketCap:null,marketCapObservedAt:null}]}}));
 await page.goto('/paper-trading');await page.getByRole('button',{name:'View CHARTSTOCK chart'}).click();
 const drawer=page.locator('.stock-detail-drawer');
 await expect(drawer.getByText('6 / 10',{exact:true})).toBeVisible();
 await drawer.getByRole('tab',{name:'Overview',exact:true}).click();
 await drawer.getByRole('button',{name:'View related stock SECOND on NSE',exact:true}).click();
 await expect(drawer.locator('.stock-drawer-title')).toContainText('SECOND');
 await expect(drawer.getByText('6 / 10',{exact:true})).toHaveCount(0);
 await drawer.getByRole('tab',{name:'Advanced chart',exact:true}).click();
 await expect(drawer.getByRole('checkbox',{name:'Trades & signals',exact:true})).toHaveCount(0);
 await expect(drawer.getByText('Current stop ₹100.00',{exact:true})).toHaveCount(0);
 await drawer.getByRole('button',{name:'Back to CHARTSTOCK',exact:true}).click();
 await expect(drawer.getByText('6 / 10',{exact:true})).toBeVisible();
 await expect(drawer.getByText('Current stop ₹100.00',{exact:true})).toBeVisible();
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});
test('a signal opens its trigger explanation and chart indicators use the saved strategy revision',async({page})=>{
 await setup(page);await page.goto('/signal-runner');await page.getByRole('button',{name:'View CHARTSTOCK chart'}).click();
 const drawer=page.getByRole('dialog');await expect(drawer.getByText('BUY signal · not a fill',{exact:true})).toBeVisible();
 await expect(drawer.getByText('EMA momentum matched').first()).toBeVisible();
 await expect(drawer.getByLabel('Visible indicators')).toContainText('Strategy');
 await expect(drawer.getByText('Revision 3 · Monitoring · Paper money')).toBeVisible();
 await drawer.getByText('1D',{exact:true}).click();await expect(drawer.getByRole('figure')).toBeVisible();
 await expect(drawer.getByLabel('Visible indicators')).toContainText('5m · Strategy');
});

test('monitoring clearly identifies older rules and a stock list with no eligible buys',async({page})=>{
 await setup(page);
 await page.route('**/api/strategies',route=>route.fulfill({json:[{...strategy,revision:4}]}));
 await page.route('**/api/paper',route=>route.fulfill({json:{...paper,sessions:[{...session,scope:{selectedIds:['NSE:1','NSE:2'],eligibleIds:[],entryIds:[],heldIds:[],monitoredIds:[],excludedIds:['NSE:1','NSE:2']}}]}}));
 await page.goto('/signal-runner');
 await expect(page.getByText('Earlier rules · current 4',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('No eligible buy stocks',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Update stock selection',exact:true})).toBeVisible();
});
test('closed trades remain chartable from order history and stocks can be navigated without a current qualification',async({page})=>{
 await setup(page);await page.route('**/api/paper/sessions/*/stocks/*/chart',route=>route.fulfill({json:{session,position:null,fills,signals:[signal],truncated:false}}));
 await page.goto('/paper-trading');await page.getByRole('tab',{name:'Trade & order history'}).click();
 await page.getByRole('button',{name:'View CHARTSTOCK chart'}).last().click();
 const drawer=page.getByRole('dialog');await expect(drawer.getByText('No open position',{exact:true})).toBeVisible();
 await expect(drawer.getByText(/^This stock is not in the current published qualified list\./)).toBeVisible();
 await expect(drawer.getByText('Current stop ₹100.00',{exact:true})).toHaveCount(0);
 await drawer.getByRole('button',{name:'Next stock'}).click();await expect(drawer.getByRole('figure',{name:'SECOND price and volume chart'})).toBeVisible();
});
test('stream candle previews update OHLC and are marked incomplete; disconnect removes live freshness',async({page})=>{
 await setup(page);await page.goto('/paper-trading');await page.getByRole('button',{name:'View CHARTSTOCK chart'}).click();
 const drawer=page.getByRole('dialog');await expect(drawer.getByRole('figure')).toBeVisible();
 await page.evaluate(value=>{
   const feeds=(window as unknown as {chartFeeds:{onmessage:((event:{data:string})=>void)|null}[]}).chartFeeds;
   for(const feed of feeds)feed.onmessage?.({data:JSON.stringify(value)});
 },{status:{state:'streaming'},quotes:[{...quote,price:109,source:'dhan-stream'}],candles:[{instrumentId:'NSE:1',time:'2026-09-28T04:30:00.000Z',open:107,high:112,low:105,close:109,volume:15,partial:true,updatedAt:now}]});
 await expect(drawer.getByText('Forming · incomplete preview',{exact:true})).toBeVisible();
 await expect(drawer.locator('.stock-chart-ohlc')).toContainText('112.00');
 await expect(drawer.getByText('Live',{exact:true})).toBeVisible();
 await page.evaluate(()=>{for(const feed of (window as unknown as {chartFeeds:{onmessage:((event:{data:string})=>void)|null}[]}).chartFeeds)feed.onmessage?.({data:JSON.stringify({status:{state:'reconnecting'}})});});
 await expect(drawer.getByText('Live',{exact:true})).toHaveCount(0);
 await expect(drawer.getByText('Last received',{exact:true})).toBeVisible();
});

test('backtest exit chart uses historical dates, one entry and the recorded partial exits',async({page})=>{
 await setup(page);
 const run={_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',strategy,status:'completed',createdAt:now,symbols:paper.symbols,config:{from:'2026-09-24',to:'2026-09-29',ids:['NSE:1'],universe:'current',includeManual:false},result:{initialCapital:100000,equity:100200,netPnl:200,returnPercent:0.2,maxDrawdownPercent:1,unavailableDecisions:0,closedTrades:1,winRate:100,profitFactor:2,totalFees:0,realizedPnl:200,openPositions:[],coverage:[],assumptions:[],curve:[{at:'2026-09-25',equity:100000},{at:now,equity:100200}],trades:[{instrumentId:'NSE:1',entryAt:'2026-09-28T04:00:01Z',exitAt:'2026-09-28T04:20:01Z',quantity:4,remainingQuantity:6,entry:100,exit:108,pnl:32,reason:'Target 1'},{instrumentId:'NSE:1',entryAt:'2026-09-28T04:00:01Z',exitAt:'2026-09-28T04:25:01Z',quantity:6,remainingQuantity:0,entry:100,exit:116,pnl:96,reason:'Target 2'}]}};
 await page.route('**/api/backtests**',route=>{const url=new URL(route.request().url()),path=url.pathname;
   if(path.endsWith('/chart'))return route.fulfill({json:{instrumentId:'NSE:1',timeframe:url.searchParams.get('timeframe'),bars:Array.from({length:75},(_,i)=>({time:new Date(Date.parse('2026-09-28T03:45:00Z')+i*300000).toISOString(),open:100,high:118,low:95,close:105,volume:1000})),source:'Stored backtest history',refreshedAt:now}});
   return route.fulfill({json:path.endsWith('/universe')?{stocks:[],listCount:0}:path.endsWith(run._id)?run:[run]});});
 const writes:string[]=[];page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/api/'))writes.push(r.url());});
 await page.goto(`/strategies?tab=backtests&rule=${strategy._id}`);await page.getByRole('button',{name:'View report',exact:true}).click();
 await page.getByRole('button',{name:'View CHARTSTOCK chart'}).last().click();
 const drawer=page.getByRole('dialog').last();
 await expect(drawer.getByText('Historical simulation',{exact:true})).toBeVisible();
 await drawer.getByRole('button',{name:'Expand row'}).click();
 await drawer.getByRole('button',{name:'Target 2',exact:true}).click();
 await expect(drawer.getByText('10 initial shares · 10 sold · 0 remaining',{exact:true})).toBeVisible();
 await expect(drawer.getByText('SELL backtest fill · 6 shares at ₹116.00',{exact:true})).toBeVisible();
 await expect(drawer.getByRole('figure')).toBeVisible();
 expect(page.url()).toContain('strategies');expect(writes).toEqual([]);
});
