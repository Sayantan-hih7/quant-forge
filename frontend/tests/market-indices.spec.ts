import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { indexCatalog, isInCategory } from '../src/modules/market-data/config/indices';

const asOf = '2026-09-23T09:30:00.000Z';
const quote = (id: string, last: number, change: number) => ({
  id, last, change, percent: change, previousClose: last-change, open: last-1, high: last+1, low: last-2,
  high52w: null, low52w: null, asOf, fetchedAt: asOf, source: 'Exchange test fixture', sourceUrl: 'https://www.nseindia.com/api/allIndices',
  status: 'snapshot', chartKind: 'observed', points: [{time:Date.parse(asOf)-60_000,value:last-1},{time:Date.parse(asOf),value:last}],
});
const quotes = [quote('nse:nifty-50',101,1),quote('nse:nifty-bank',99,-1),quote('nse:nifty-midcap-select',100,0),quote('bse:bse-sensex',201,1),
  {...quote('nse:nifty-capital-goods',50,-1),open:null,high:null,low:null,status:'eod',chartKind:'daily',asOf:'2026-09-22T10:00:00.000Z'}];

test.beforeEach(async ({page}) => {
  await page.route('**/api/market-indices',route => route.fulfill({json:{quotes,sources:[],refreshAfterMs:60000}}));
  await page.route('**/api/market-indices/chart?*',route => route.fulfill({json:{points:quotes[3].points,chartKind:'intraday'}}));
});

test('catalog keeps both exchanges, categories and overlapping derivative membership', () => {
  expect(new Set(indexCatalog.map(i=>i.id)).size).toBe(114);
  for(const [exchange,broad,sectoral,derivatives] of [['NSE',23,34,6],['BSE',30,27,4]] as const){
    const indices=indexCatalog.filter(i=>i.exchange===exchange);
    expect(indices.filter(i=>isInCategory(i,'broad'))).toHaveLength(broad);
    expect(indices.filter(i=>isInCategory(i,'sectoral'))).toHaveLength(sectoral);
    expect(indices.filter(i=>isInCategory(i,'derivatives'))).toHaveLength(derivatives);
  }
});

test('real-data contract distinguishes missing values from flat prices and exports source dates', async ({page}) => {
  await page.goto('/market-data/indices');
  const summary=page.getByRole('region',{name:'Index direction summary'});
  await expect(summary).toContainText('1 Up');await expect(summary).toContainText('1 Down');await expect(summary).toContainText('1 Unchanged');await expect(summary).toContainText('3 Unavailable');
  await page.locator('.indices-toolbar .ant-segmented-item').filter({hasText:/^Unavailable$/}).click();
  await expect(page.locator('.indices-table tbody tr.ant-table-row')).toHaveCount(3);
  await expect(page.locator('.indices-table .index-last').first()).toHaveText('—');
  await page.locator('.indices-toolbar .ant-segmented-item').filter({hasText:/^All moves$/}).click();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();const file=await downloaded;
  expect(file.suggestedFilename()).toBe('indices-nse-derivatives.csv');
  const csv=await readFile((await file.path())!,'utf8');expect(csv).toContain(asOf);expect(csv).toContain('Source URL');expect(csv).not.toContain('Simulated');
  await page.getByRole('button',{name:'NIFTY 50',exact:true}).click();
  const drawer=page.getByRole('dialog');await expect(drawer).toContainText('Exchange test fixture');await expect(drawer.getByText('52-week high').locator('..')).toContainText('—');
  await expect(page.locator('.ant-drawer .trend-chart')).toBeVisible();
});

test('global suggestions switch exchange/category and daily-only indices retain their identity', async ({page}) => {
  await page.goto('/market-data/indices');
  const search=page.getByRole('combobox',{name:'Search indices across NSE and BSE'});await search.fill('sensex');
  await page.locator('.ant-select-item-option').filter({has:page.getByText('BSE SENSEX',{exact:true})}).click();
  await expect(page).toHaveURL(/exchange=BSE&category=broad&index=bse%3Abse-sensex/);
  await expect(page.locator('.ant-drawer .trend-chart')).toHaveAttribute('aria-label',/intraday/);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page).not.toHaveURL(/index=/);await search.fill('capital goods');
  await page.locator('.ant-select-item-option').filter({has:page.getByText('NIFTY CAPITAL GOODS',{exact:true})}).click();
  await expect(page).toHaveURL(/exchange=NSE&category=sectoral/);await expect(page.getByRole('dialog')).toContainText('Daily close');
  await expect(page.getByRole('dialog')).toContainText('22 Sept 2026');
});

test('provider outage preserves catalogue without simulated prices; mobile and themes still work', async ({page}) => {
  await page.route('**/api/market-indices',route => route.fulfill({status:503,json:{message:'Index provider unavailable'}}));
  await page.setViewportSize({width:390,height:844});await page.goto('/market-data/indices');
  await expect(page.getByRole('alert')).toContainText('Index provider unavailable');
  await expect(page.getByText('0 / 57 indices available')).toBeVisible();
  const search=page.getByRole('combobox',{name:'Search indices across NSE and BSE'});await search.fill('sensex');
  await expect(page.locator('.ant-select-item-option').filter({has:page.getByText('BSE SENSEX',{exact:true})})).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('.index-highlight-price').first()).toHaveText('—');
});

test('auto-update can be paused, manually refreshed and resumed', async ({page}) => {
  await page.clock.install();
  let calls=0;
  await page.route('**/api/market-indices',route => {
    calls++;
    return route.fulfill({json:{quotes:[quote('nse:nifty-50',100+calls,calls)],sources:[],refreshAfterMs:15000}});
  });
  await page.goto('/market-data/indices');
  await expect(page.getByText('1 / 57 indices available')).toBeVisible();
  const toggle=page.getByRole('switch',{name:'Auto-update index data'});
  await toggle.click();await expect(toggle).not.toBeChecked();
  const pausedCalls=calls;await page.clock.fastForward(20000);expect(calls).toBe(pausedCalls);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect.poll(()=>calls).toBe(pausedCalls+1);
  await toggle.click();await expect(toggle).toBeChecked();
  await page.clock.fastForward(16000);await expect.poll(()=>calls).toBeGreaterThan(pausedCalls+1);
  await expect(page.locator('.index-highlight-price').first()).toHaveText(`${100+calls}.00`);
});
