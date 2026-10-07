import {test,expect,type Page} from '@playwright/test';
import {sampleTradingPlan} from '../src/modules/strategies/utils/tradingPlans';
const now='2026-09-28T06:00:00.000Z';
const strategy={...sampleTradingPlan('intraday'),_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:1,savedAt:now};
const session={_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',strategy,mode:'automatic',active:true,entriesPaused:false,cashPaise:943856,initialPaise:1000000,bookedPnlPaise:3916,ids:['NSE:1','NSE:2']};
const position={_id:`${session._id}:NSE:1`,sessionId:session._id,instrumentId:'NSE:1',symbol:'TESTSTOCK',quantity:6,initialQuantity:10,entryPaise:10000,costPaise:60060,stopPaise:9600,targetPaise:12000,openedAt:'2026-09-28T05:00:01.000Z',mark:{pricePaise:11000,valuePaise:66000,unrealizedPaise:5940,at:now,fresh:true,source:'dhan'}};
const exit={_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',sessionId:session._id,instrumentId:'NSE:1',side:'SELL',status:'filled',source:'manual',quantity:4,entryPaise:10000,fillPaise:11000,feePaise:44,entryFeePaise:40,allocatedCostPaise:40040,realizedPnlPaise:3916,createdAt:now,filledAt:now,reason:'Manual partial exit'};
const pending={_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sessionId:session._id,instrumentId:'NSE:2',side:'BUY',status:'pending',source:'signal',quantity:5,orderType:'limit',limitPaise:9000,createdAt:now,eligibleAfter:now,expiresAt:'2026-09-28T09:45:00.000Z',reason:'Buy rules matched'};
const paper={sessions:[session],positions:[position],orders:[exit,pending],signals:[],symbols:{'NSE:1':'TESTSTOCK','NSE:2':'SECOND'},workerRunning:true,marketOpen:true,feed:{state:'live',freshIds:['NSE:1','NSE:2']}};
async function setup(page:Page){
 await page.clock.setFixedTime(new Date(now));
 await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().endsWith('/session')?{authenticated:true,mode:'local'}:{}}));
 await page.route('**/api/paper',route=>route.fulfill({json:paper}));
 await page.route('**/api/paper/orders?**',route=>route.fulfill({json:{items:new URL(route.request().url()).searchParams.get('exitsOnly')==='true'?[exit]:[exit,pending],summary:{buys:1,exits:1,feesPaise:144,realizedPnlPaise:3916,missing:0},symbols:paper.symbols,hasMore:false,next:null}}));
 await page.route('**/api/paper/instruments',route=>route.fulfill({json:[{_id:'NSE:1',symbol:'TESTSTOCK',exchange:'NSE'},{_id:'NSE:2',symbol:'SECOND',exchange:'NSE'}]}));
}
test('trade history displays net exit P&L and total P&L, retains orders and fits mobile',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await page.goto('/paper-trading');
 await expect(page.getByText('Total P&L',{exact:true})).toBeVisible();
 await expect(page.locator('.ant-statistic').filter({hasText:'Total P&L'})).toContainText('98.56');
 await expect(page.getByText('Intraday auto square-off · 3:15 PM IST',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Trade & order history'}).click();
 await expect(page.getByRole('columnheader',{name:'Net P&L'})).toBeVisible();
 await expect(page.getByRole('cell',{name:'₹39.16 9.78%'})).toBeVisible();
 await expect(page.getByText('1 buy fills · 1 exit fills',{exact:true})).toBeVisible();
 await page.getByText('All orders',{exact:true}).click();await expect(page.getByRole('cell',{name:'pending',exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('paper-history-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('paper-history-mobile.png'),fullPage:true});expect(errors).toEqual([]);
});
test('exit all is a direct confirmed market exit, without a default one-share order',async({page})=>{
 await setup(page);let input:Record<string,unknown>|undefined;
 await page.route('**/api/paper/positions/*/exit',route=>{input=route.request().postDataJSON();return route.fulfill({json:{_id:input?.id,status:'pending'}});});
 await page.goto('/paper-trading');await page.getByRole('button',{name:'Exit all',exact:true}).click();
 await expect(page.getByText('Sell all 6 TESTSTOCK shares?',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Exit all shares',exact:true}).click();
 await expect.poll(()=>input).toMatchObject({expectedOpenedAt:position.openedAt});expect(input?.quantity).toBeUndefined();expect(input?.id).toBeTruthy();
 await expect(page.getByRole('tab',{name:/Awaiting action/})).toHaveAttribute('aria-selected','true');
});
test('manual partial sell starts with held shares and provides an easy half-position shortcut',async({page})=>{
 await setup(page);let input:Record<string,unknown>|undefined;
 await page.route('**/api/paper/positions/*/exit',route=>{input=route.request().postDataJSON();return route.fulfill({json:{status:'pending'}});});
 await page.goto('/paper-trading');await page.getByRole('button',{name:'Sell quantity',exact:true}).click();
 const drawer=page.getByRole('dialog');await expect(drawer.getByRole('spinbutton',{name:'Shares to sell · 6 held'})).toHaveValue('6');
 await drawer.getByRole('button',{name:'50%',exact:true}).click();await expect(drawer.getByRole('spinbutton',{name:'Shares to sell · 6 held'})).toHaveValue('3');
 await drawer.getByRole('button',{name:'Submit sell order',exact:true}).click();
 await expect.poll(()=>input).toMatchObject({quantity:3,expectedOpenedAt:position.openedAt});expect(input?.limitPrice).toBeUndefined();await expect(drawer).toHaveCount(0);
});
test('pending price edits use a visible limit price and leave fills immutable',async({page})=>{
 await setup(page);let input:Record<string,unknown>|undefined;
 await page.route('**/api/paper/orders/'+pending._id,route=>{input=route.request().postDataJSON();return route.fulfill({json:{...pending,limitPaise:9750}});});
 await page.goto('/paper-trading');await page.getByRole('tab',{name:/Awaiting action/}).click();await page.getByRole('button',{name:'Modify price',exact:true}).click();
 const drawer=page.getByRole('dialog');await expect(drawer.getByRole('spinbutton',{name:'Maximum buy price (₹)'})).toHaveValue('90.00');
 await drawer.getByRole('spinbutton',{name:'Maximum buy price (₹)'}).fill('97.50');await drawer.getByRole('button',{name:'Save order change'}).click();
 await expect.poll(()=>input).toEqual({orderType:'limit',limitPrice:97.5,expectedEligibleAfter:pending.eligibleAfter});
 await page.getByRole('tab',{name:'Trade & order history'}).click();await expect(page.getByRole('button',{name:'Modify price',exact:true}).filter({visible:true})).toHaveCount(0);
});

for (const marketOpen of [false,true]) test(`market session status: open=${marketOpen}`,async({page})=>{
 await setup(page);
 await page.route('**/api/paper',route=>route.fulfill({json:{...paper,positions:[],marketOpen,feed:{...paper.feed,state:'connected',message:'Feed connected. Waiting for new trades.'},safety:{warnings:[],notices:['NSE paper execution uses a conservative window.']}}}));
 await page.goto('/paper-trading');
 await expect(page.getByText('Market closed',{exact:true})).toHaveCount(marketOpen?0:1);
 await expect(page.getByText('Paper fills are waiting',{exact:true})).toHaveCount(marketOpen?1:0);
 await expect(page.getByText('Execution safety',{exact:true})).toHaveCount(0);
 await expect(page.getByText('NSE paper execution uses a conservative window.',{exact:true})).not.toBeVisible();
 await page.getByText('Paper execution hours and limitations',{exact:true}).click();
 await expect(page.getByText('NSE paper execution uses a conservative window.',{exact:true})).toBeVisible();
});
test('closed market retains actual safety warnings and unclosed intraday positions',async({page})=>{
 await setup(page);
 await page.route('**/api/paper',route=>route.fulfill({json:{...paper,marketOpen:false,safety:{warnings:['Clock check failed.'],notices:[]}}}));
 await page.goto('/paper-trading');
 await expect(page.getByText('Market closed',{exact:true})).toBeVisible();
 await expect(page.getByText('Clock check failed.',{exact:true})).toBeVisible();
 await expect(page.getByText('Intraday positions remain open after market close',{exact:true})).toBeVisible();
});
