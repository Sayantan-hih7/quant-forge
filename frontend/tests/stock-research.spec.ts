import { test, expect, type Page } from '@playwright/test';
import { initialMonthlyRule, newMonthlyCondition } from '../src/modules/qualification/config/monthlyFields';
import { ruleFields } from '../src/modules/qualification/config/ruleFields';
import { reviewMonthlyRule } from '../../backend/src/modules/qualification/services/monthly-review.service';
const now = '2026-09-30T12:00:00Z';
const stock = { instrumentId:'NSE:1', isin:'INE123', source:'scan', addedAt:now, instrument:{symbol:'EXAMPLE',name:'Example Limited',exchange:'NSE'}, metrics:{sector:'Banking',index:[]} };
const bars = Array.from({length:240},(_,i)=>({time:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:100+i*.2,high:105+i*.2,low:97+i*.2,close:102+i*.2+Math.sin(i),volume:1000+i*5}));
async function fixture(page:Page) {
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(()=> {window.EventSource=class {onmessage=null;onerror=null;close(){}} as unknown as typeof EventSource;});
  let rule={...initialMonthlyRule,groups:[{logic:'AND' as const,conditions:[{...newMonthlyCondition('marketCap'),value:2000},{...newMonthlyCondition('ema'),period:5,operand:'field' as const,compareField:'ema',comparePeriod:21}]}]},revision=1;
  const writes:Record<string,unknown>[]=[];
  await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().endsWith('/session')?{authenticated:true,mode:'local'}:{}}));
  await page.route('**/api/qualification',route=>route.fulfill({json:{month:'2026-09',rule:{rule,revision,fingerprint:'test'},runs:[],universe:{runId:'test',members:[stock]},canRun:false}}));
  await page.route('**/api/qualification/universe',route=>route.fulfill({json:[stock]}));
  await page.route('**/api/qualification/membership',route=>route.fulfill({json:{month:'2026-09',published:true,members:[stock]}}));
  await page.route('**/api/qualification/rule/review',route=>route.fulfill({json:reviewMonthlyRule(route.request().postDataJSON())}));
  await page.route('**/api/qualification/rule',route=>{const body=route.request().postDataJSON();writes.push(body);rule=body.rule;revision++;return route.fulfill({json:{revision}});});
  await page.route('**/api/market-data/capabilities',route=>route.fulfill({json:{monthlyFields:Object.keys(ruleFields).filter(id=>ruleFields[id].monthly),technical:Object.keys(ruleFields).filter(id=>ruleFields[id].source==='candles'),snapshotFields:[],choices:{sector:[],index:[]}}}));
  await page.route('**/api/watchlists',route=>route.fulfill({json:{lists:[{_id:'personal',ids:[]}],universeCount:1}}));
  await page.route('**/api/stocks/**',route=>{
    const url=new URL(route.request().url()),instrument={_id:stock.instrumentId,...stock.instrument,isin:stock.isin,active:true};
    if(url.pathname.endsWith('/quotes'))return route.fulfill({json:{quotes:[]}});
    if(url.pathname.endsWith('/listings'))return route.fulfill({json:{instrument,listings:[instrument]}});
    if(url.pathname.endsWith('/chart'))return route.fulfill({json:{instrumentId:stock.instrumentId,timeframe:url.searchParams.get('timeframe'),bars: url.pathname.includes('/benchmarks/')?bars.map(b=>({...b,close:100})):bars,source:'fixture',historyVerified:true,latestCandleAt:bars.at(-1)!.time}});
    return route.fulfill({json:{instrument,facts:[],qualification:null}});
  });
  return writes;
}

test('stock research has honest technicals, depth, news and an exchange events calendar',async({page},info)=>{
  test.setTimeout(60000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const writes=await fixture(page);let depthRequests=0;
  const base={status:'ready',coverage:'Exchange test fixture',fetchedAt:now,today:'2026-09-30',from:'2026-07-02',to:'2027-03-29',exchange:'NSE'};
  await page.route('**/api/stocks/*/depth',route=>{depthRequests++;return route.fulfill({json:{depth:{bids:[{price:100,quantity:500,orders:2}],asks:[{price:101,quantity:700,orders:3}],totalBuy:1000,totalSell:3000,source:'Dhan snapshot',receivedAt:now},session:{open:false,reason:'Market closed',closesAt:'2026-09-30T10:00:00Z',nextOpenAt:'2026-10-01T03:45:00Z'}}});});
  await page.route('**/api/stocks/*/news',route=>route.fulfill({json:{...base,items:[{id:'news1',symbol:'EXAMPLE',company:'Example',date:'2026-09-29T09:00:00Z',title:'Investor presentation',description:'Company published its quarterly presentation.',kind:'announcement',source:'NSE',url:'https://www.nseindia.com/companies-listing/corporate-filings-announcements'},{id:'deal',symbol:'EXAMPLE',company:'Example',date:'2026-09-29T00:00:00Z',title:'Example Fund',description:'Reported transaction, not a recommendation.',kind:'bulk',source:'NSE',url:'https://www.nseindia.com/market-data/large-deals',side:'SELL',quantity:1000,price:100}]}}));
  await page.route('**/api/stocks/*/events*',route=>route.fulfill({json:{...base,items:route.request().url().includes('scope=market')?[{id:'event1',symbol:'OTHER',company:'Other Company',date:'2026-10-05',title:'Dividend',description:'',kind:'action',source:'NSE',dateLabel:'Ex-date',recordDate:'2026-10-06',url:'https://www.nseindia.com/companies-listing/corporate-filings-actions'}]:[]}}));
  await page.goto('/qualification');await page.getByRole('button',{name:'View EXAMPLE details'}).click();
  const drawer=page.locator('.stock-detail-drawer');
  await expect(drawer.getByRole('tab',{name:'Overview',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(drawer.getByLabel('Market depth',{exact:true})).toContainText('25.0%');
  await expect(drawer.getByLabel('Market depth',{exact:true})).toContainText('75.0%');
  await expect(drawer.getByLabel('Market depth',{exact:true})).toContainText('Market closed');
  expect(depthRequests).toBe(1);
  await drawer.getByRole('tab',{name:'Technicals',exact:true}).click();
  await expect(drawer.getByLabel('Stock technical analysis')).toContainText('6 of 6 directional readings available');
  await expect(drawer.getByLabel('Stock technical analysis')).toContainText('Traditional daily pivots');
  await page.screenshot({path:info.outputPath('stock-technicals-desktop.png'),animations:'disabled'});
  await drawer.getByRole('tab',{name:'News',exact:true}).click();await expect(drawer.getByText('Investor presentation',{exact:true})).toBeVisible();
  await drawer.getByText('Bulk / block deals',{exact:true}).click();await expect(drawer.getByText('Investor presentation',{exact:true})).toHaveCount(0);await expect(drawer.getByText('Sold 1,000 shares',{exact:false})).toBeVisible();
  await drawer.getByRole('tab',{name:'Events',exact:true}).click();await expect(drawer.getByText('No upcoming events reported in this date range.')).toBeVisible();
  await drawer.getByRole('button',{name:'Explore upcoming events in other stocks'}).click();
  const calendar=page.getByRole('dialog',{name:'Exchange events calendar'});await expect(calendar.getByText('Other Company',{exact:true})).toBeVisible();await expect(calendar).toContainText('Ex-date · 2026-10-05');
  await calendar.getByRole('button',{name:'Close',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await drawer.getByRole('tab',{name:'Overview',exact:true}).click();
  await drawer.getByLabel('Market depth',{exact:true}).scrollIntoViewIfNeeded();
  expect(await drawer.locator('.ant-drawer-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('stock-depth-mobile.png'),animations:'disabled'});
  expect(writes).toHaveLength(0);expect(errors).toEqual([]);
});

test('short history and a failed event request do not masquerade as neutral or no events',async({page})=>{
  await fixture(page);
  await page.route('**/api/stocks/*/chart*',route=>route.fulfill({json:{instrumentId:'NSE:1',timeframe:'1d',bars:bars.slice(0,5),historyVerified:true}}));
  await page.route('**/api/stocks/*/events',route=>route.fulfill({json:{items:[],status:'unavailable',message:'Exchange temporarily unavailable',today:'2026-09-30',from:'2026-07-01',to:'2027-03-01',coverage:'NSE corporate actions',fetchedAt:null}}));
  await page.goto('/qualification');await page.getByRole('button',{name:'View EXAMPLE details'}).click();
  const drawer=page.locator('.stock-detail-drawer');await drawer.getByRole('tab',{name:'Technicals',exact:true}).click();
  await expect(drawer.locator('.technical-verdict')).toContainText('Insufficient history');await expect(drawer.locator('.technical-verdict')).toContainText('0 of 6');
  await drawer.getByRole('tab',{name:'Events',exact:true}).click();await expect(drawer.getByText('Exchange updates are unavailable',{exact:true})).toBeVisible();await expect(drawer.getByText('No upcoming events reported in this date range.')).toHaveCount(0);
});

test('closed-market depth stops polling until the next session',async({page})=>{
  await fixture(page);await page.clock.install({time:new Date(now)});let requests=0;
  await page.route('**/api/stocks/*/depth',route=>{requests++;return route.fulfill({json:{depth:null,session:{open:false,reason:'Market closed',closesAt:'2026-09-30T10:00:00Z',nextOpenAt:'2026-10-01T03:45:00Z'}}});});
  await page.goto('/qualification');await page.getByRole('button',{name:'View EXAMPLE details'}).click();await expect.poll(()=>requests).toBe(1);
  await page.clock.fastForward(60000);expect(requests).toBe(1);
});

test('financial results switch frequency and accounting basis without mixing values, including mobile charts', async ({ page }, info) => {
  await fixture(page);
  const period = (date: string, revenue: number, netProfit: number) => ({ period: date, revenue, netProfit, eps: 5, ebitda: 20, sales: revenue - 1 });
  await page.route('**/api/stocks/*/financials', route => route.fulfill({ json: { status: 'ready', source: 'Dhan public company financials', sourceUrl: 'https://dhan.co/stocks/reliance-industries-ltd-share-price/', fetchedAt: now, statements: [
    { basis: 'consolidated', frequency: 'quarterly', periods: [period('2025-06-30', 100, -10), period('2026-03-31', 120, 20), period('2026-06-30', 150, 30)] },
    { basis: 'consolidated', frequency: 'annual', periods: [period('2025-03-31', 400, 40), period('2026-03-31', 600, 60)] },
    { basis: 'standalone', frequency: 'annual', periods: [period('2026-03-31', 300, -5)] },
  ] } }));
  await page.goto('/qualification'); await page.getByRole('button', { name: 'View EXAMPLE details' }).click();
  const drawer = page.locator('.stock-detail-drawer');
  await drawer.getByRole('tab', { name: 'Financials', exact: true }).click();
  const financials = drawer.getByLabel('Financial performance', { exact: true });
  await expect(financials.locator('.financial-highlights')).toContainText('₹150.00 Cr');
  await expect(financials.locator('.financial-highlights')).toContainText('+50.00%');
  await expect(financials.getByRole('figure')).toBeVisible();
  await financials.getByText('Yearly', { exact: true }).click();
  await expect(financials.locator('.financial-highlights')).toContainText('₹600.00 Cr');
  await financials.getByLabel('Financial statement basis').click();
  await page.getByRole('option', { name: 'Standalone', exact: true }).click();
  await expect(financials.locator('.financial-highlights')).toContainText('₹300.00 Cr');
  await expect(financials.locator('.financial-highlights')).toContainText('₹-5.00 Cr');
  await page.screenshot({ path: info.outputPath('financials-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await financials.getByText('Net profit', { exact: true }).click();
  await expect(financials.getByRole('figure')).toHaveAttribute('aria-label', 'Net profit by year');
  expect(await drawer.locator('.ant-drawer-body').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await financials.getByRole('figure').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('financials-mobile.png'), animations: 'disabled' });
});

test('beta shows its benchmark and short-history explanation separately from directional votes', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/stocks/*/chart*', route => route.fulfill({ json: { instrumentId: 'NSE:1', timeframe: '1d', bars: bars.slice(0, 6), historyVerified: true } }));
  await page.goto('/qualification'); await page.getByRole('button', { name: 'View EXAMPLE details' }).click();
  await page.getByRole('tab', { name: 'Technicals', exact: true }).click();
  const beta = page.getByLabel('Stock beta', { exact: true });
  await expect(beta).toContainText('vs NIFTY 50');
  await expect(beta).toContainText('Needs 253 matching completed daily prices');
  await expect(beta).toContainText('5 matched returns available');
  await expect(page.locator('.technical-verdict')).toContainText('0 of 6 directional readings available');
});

