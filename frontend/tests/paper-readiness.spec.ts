import {test,expect} from '@playwright/test';
import {sampleTradingPlan} from '../src/modules/strategies/utils/tradingPlans';
const strategy={...sampleTradingPlan('swing'),_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:1,savedAt:new Date().toISOString()};
const session={_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',strategy,mode:'confirmation',active:true,entriesPaused:false,cashPaise:10000000,initialPaise:10000000,ids:['NSE:1','NSE:2'],scope:{selectedIds:['NSE:1','NSE:2'],eligibleIds:['NSE:1'],excludedIds:['NSE:2'],heldIds:[],monitoredIds:['NSE:1'],entryIds:['NSE:1']},message:'Waiting for the next completed daily candle.'};
const stocks=[{_id:'NSE:1',symbol:'ELIGIBLE',exchange:'NSE',source:'scan'},{_id:'NSE:2',symbol:'SECOND',exchange:'NSE',source:'manual'}];
const paper={sessions:[],positions:[],signals:[],orders:[],workerRunning:true,marketOpen:true,feed:{state:'disconnected',enabled:false,workerRunning:true,freshIds:[],subscribedIds:[]}};
test.beforeEach(async({page})=>{
 await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().endsWith('/session')?{authenticated:true,mode:'local'}:{}}));
 await page.route('**/api/strategies',route=>route.fulfill({json:[strategy]}));
 await page.route('**/api/backtests/universe**',route=>route.fulfill({json:{stocks,listCount:1}}));
 await page.route('**/api/paper',route=>route.fulfill({json:paper}));
});
test('signals are visible across strategies, including expired alerts; paper records are a separate page',async({page})=>{
 await page.route('**/api/paper',route=>route.fulfill({json:{...paper,sessions:[session,{...session,_id:'other',strategy:{...strategy,name:'Intraday strategy'}}],symbols:{'NSE:1':'ELIGIBLE'},signals:[{_id:'signal',sessionId:'other',instrumentId:'NSE:1',side:'BUY',barEnd:'2026-09-28T04:25:00Z',orderId:'order'}],orders:[{_id:'order',sessionId:'other',instrumentId:'NSE:1',side:'BUY',status:'expired',createdAt:'2026-09-28T04:26:00Z',quantity:0,source:'signal',reason:'Buy match'}]}}));
 await page.goto('/signal-runner');
 await expect(page.getByRole('button',{name:'View ELIGIBLE chart',exact:true})).toBeVisible();
 await expect(page.getByRole('cell',{name:'expired',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Connect execution feed',exact:true})).toHaveCount(0);
 await expect(page.getByText('Paper accounts',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Waiting for the next completed daily candle.').first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('monitoring defaults to all qualified stocks and signals only; no preview or connect step required',async({page})=>{
 let input:Record<string,unknown>|undefined;
 const writes:string[]=[];
 page.on('request',r=>{if(r.method()==='POST')writes.push(new URL(r.url()).pathname);});
 await page.route('**/api/paper/sessions',route=>{input=route.request().postDataJSON();return route.fulfill({json:{_id:session._id}});});
 await page.goto('/signal-runner?setup=1');
 await expect(page.getByText('2 selected / 2 available',{exact:true})).toBeVisible();
 await expect(page.getByText('Live data connects automatically',{exact:true}).filter({visible:true}).last()).toBeVisible();
 await page.getByRole('button',{name:'Start signals',exact:true}).click();
 await expect.poll(()=>input).toMatchObject({strategyId:strategy._id,ids:['NSE:1','NSE:2'],mode:'signals',expectedRevision:1});
 expect(writes.filter(p=>p.startsWith('/api/paper')||p.startsWith('/api/market-feed'))).toEqual(['/api/paper/sessions']);
});
test('backtest starts with every qualified stock, including selections larger than the previous 100-stock cap',async({page})=>{
 const all=Array.from({length:159},(_,i)=>({...stocks[0],_id:`NSE:${i+1}`,symbol:`STOCK${i+1}`}));
 await page.route('**/api/backtests/universe**',route=>route.fulfill({json:{stocks:all,listCount:1}}));
 let input:{ids:string[];includeManual:boolean}|undefined;
 await page.route('**/api/backtests',route=>{if(route.request().method()==='POST'){input=route.request().postDataJSON();return route.fulfill({json:{id:'fixture'}});}return route.fulfill({json:[]});});
 await page.goto('/strategies?tab=backtests&rule='+strategy._id);
 await expect(page.getByText('159 selected / 159 available',{exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:"I understand this uses today's list for research"}).check();
 await page.getByRole('button',{name:'Run backtest',exact:true}).click();
 await expect.poll(()=>input?.ids.length).toBe(159);expect(input?.includeManual).toBe(true);
});
test('a tested strategy passes its report into paper monitoring and preserves its stock selection',async({page})=>{
 const runId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await page.route('**/api/backtests/'+runId,route=>route.fulfill({json:{_id:runId,strategy,status:'completed',config:{ids:['NSE:1'],universe:'current',includeManual:false}}}));
 let input:Record<string,unknown>|undefined;
 await page.route('**/api/paper/sessions',route=>{input=route.request().postDataJSON();return route.fulfill({json:{_id:session._id}});});
 await page.goto(`/signal-runner?setup=1&strategy=${strategy._id}&backtest=${runId}`);
 await expect(page.getByText('1 selected / 2 available',{exact:true})).toBeVisible();
 await page.getByLabel('What should happen when rules match?',{exact:true}).click();
 await page.getByText('Paper trade automatically',{exact:true}).last().click();
 await page.getByRole('button',{name:'Start paper trading',exact:true}).click();
 await expect.poll(()=>input).toMatchObject({sourceBacktestId:runId,strategyId:strategy._id,ids:['NSE:1'],mode:'automatic'});
});

test('clock warning and emergency entry halt are visible and explicit',async({page})=>{
 await page.route('**/api/paper',route=>route.fulfill({json:{...paper,safety:{clock:{state:'blocked',message:'Clock drift'},warnings:['Computer clock differs by 15 seconds. Signals and fills are paused.'],halted:false}}}));
 let requested:unknown;
 await page.route('**/api/paper/safety',async route=>{requested=route.request().postDataJSON();await route.fulfill({json:{ok:true}});});
 await page.goto('/paper-trading');
 await expect(page.getByText('Computer clock differs by 15 seconds. Signals and fills are paused.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Emergency: stop new buys',exact:true}).click();
 await expect.poll(()=>requested).toEqual({halted:true});
});


test('backtest exchange choice persists and suitability follows the saved holding period',async({page})=>{
 const assessedAt=new Date().toISOString();
 const fit=(status:'matched'|'not-matched'|'unavailable')=>({version:'test',assessedAt,profiles:[{horizon:'swing',label:'Swing',status,checks:[{label:'Liquidity',rule:'At least INR 2 Cr',value:status==='unavailable'?null:1,unit:'Cr',status:status==='matched'?'pass':status==='not-matched'?'fail':'unavailable',reason:'Fixture assessment'}]}]});
 const rows=[{...stocks[0],suitability:fit('matched')},{...stocks[1],suitability:fit('not-matched')},{_id:'BSE:3',symbol:'BSEONLY',exchange:'BSE',source:'scan',suitability:fit('unavailable')}];
 await page.route('**/api/backtests/universe**',route=>route.fulfill({json:{stocks:rows,listCount:1}}));
 await page.route('**/api/backtests?**',route=>route.fulfill({json:[]}));
 await page.goto('/strategies?tab=backtests&rule='+strategy._id);
 await expect(page.getByText('2 selected / 2 available',{exact:true})).toBeVisible({timeout:20000});
 await expect(page.getByText('Swing / short-term screening: 1 selected matches, 1 outside profile, 0 need data')).toBeVisible();
 await page.getByRole('combobox',{name:'Qualified stocks',exact:true}).click();
 await expect(page.locator('.ant-select-dropdown').filter({visible:true}).getByText('Swing: Matches profile',{exact:true})).toBeVisible();
 await expect(page.locator('.ant-select-dropdown').filter({visible:true}).getByText('Swing: Outside profile',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Select matching stocks (1)',exact:true}).click();
 await expect(page.getByText('1 selected / 2 available',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Backtest exchange',exact:true}).click();
 await page.getByText('BSE only',{exact:true}).click();
 await expect(page.getByText('1 selected / 1 available',{exact:true})).toBeVisible();
 await expect(page.getByText('Swing / short-term screening: 0 selected matches, 0 outside profile, 1 need data')).toBeVisible();
 await page.reload();
 await expect(page.getByText('1 selected / 1 available',{exact:true})).toBeVisible();
});
