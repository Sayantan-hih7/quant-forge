import { respondToStrategyReview } from './helpers/strategyReview';
import { test, expect, type Page } from '@playwright/test';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import type { SavedStrategy } from '../src/modules/strategies/hooks/useBackendStrategies';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const record = (): SavedStrategy => ({ ...sampleTradingPlan('swing'), _id: id, revision: 2, savedAt: new Date().toISOString() });
const stocks = [{ _id: 'NSE:1', symbol: 'ALPHA', exchange: 'NSE', source: 'scan' }, { _id: 'NSE:2', symbol: 'BETA', exchange: 'NSE', source: 'scan' }];
const riskStep = (page: Page) => page.getByRole('navigation', { name: 'Strategy editor steps' }).getByRole('button', { name: '4 Risk' });
const select = async (page: Page, label: string, option: string) => {
  const control=page.getByLabel(label, { exact: true });
  await control.click();
  const listId=await control.getAttribute('aria-controls');
  const dropdown=page.locator('.ant-select-dropdown').filter({has:page.locator(`[id="${listId}"]`)});
  await dropdown.getByText(option, { exact: true }).click();
  await expect(control).toHaveAttribute('aria-expanded','false');
  await expect(control.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')).toContainText(option);
};
async function fixture(page: Page, initial = record(), beforeReply?: () => Promise<void>) {
  let saved = initial, writes = 0;
  await page.route('**/api/session', route => route.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', route => route.fulfill({ json: [saved] }));
  await page.route('**/api/strategies/*', async route => {
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route);
    saved = { ...route.request().postDataJSON().draft, _id: id, revision: ++writes + 2, savedAt: new Date().toISOString() };
    await beforeReply?.();
    return route.fulfill({ json: saved });
  });
  await page.route('**/api/backtests**', route => route.fulfill({ json: route.request().url().includes('/universe') ? { stocks, listCount: 1 } : [] }));
  await page.route('**/api/paper', route => route.fulfill({ json: { sessions: [], positions: [], orders: [], signals: [], workerRunning: true, feed: { state: 'offline', message: 'Fixture' } } }));
  await page.route('**/api/paper/sessions', route => route.fulfill({ status: 500, json: { message: 'UI tests cannot create real paper sessions' } }));
  return { saved: () => saved, writes: () => writes };
}

test('candle-low stop and target stop steps survive saving, reloading and clearing', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const initial=record();
  initial.risk.exitTargets=[{basis:'risk',value:2,closePercent:40},{basis:'risk',value:5,closePercent:30},{basis:'risk',value:8,closePercent:30}];
  initial.risk.stopManagement=undefined;initial.risk.breakevenAfterTarget1=false;
  const state=await fixture(page,initial);
  await page.goto('/strategies?rule='+id);
  await page.getByRole('navigation',{name:'Strategy editor steps'}).getByRole('button',{name:'3 Sell'}).click();
  await select(page,'Exit plan','Stops and targets only');
  await expect(page.getByText('No indicator-based sell signal.',{exact:false})).toBeVisible();
  await riskStep(page).click();
  await select(page,'Initial stop method','Completed signal candle low');
  await page.getByLabel('Reference entry price (₹)',{exact:true}).fill('100');
  await page.getByLabel('Example signal candle low (₹)',{exact:true}).fill('96');
  await select(page,'After Target 1 fills, move SL to','Entry price');
  await select(page,'After Target 2 fills, move SL to','Target 1 price');
  const example=page.getByRole('region',{name:'Example calculator'});
  await expect(example.getByTestId('initial-risk-preview')).toContainText('Initial SL ₹96.00');
  await expect(example).toContainText('After Target 2 fills, move the stop to ₹108.00');
  await expect(page.getByRole('button',{name:'Remove Target 1',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(state.writes).toBe(1);
  expect(state.saved().exit.enabled).toBe(false);expect(state.saved().exit.groups).toEqual([]);
  expect(state.saved().risk.stopMode).toBe('candleLow');
  expect(state.saved().risk.exitTargets?.map(t=>t.moveStopTo)).toEqual([0,1,undefined]);
  expect(JSON.stringify(state.saved())).not.toMatch(/signalLow|referenceEntry/);
  await page.getByRole('region',{name:'Profit-taking plan'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('target-steps-light.png')});
  await page.getByLabel('Dark theme',{exact:true}).click();
  await page.screenshot({path:testInfo.outputPath('target-steps-dark.png')});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('target-steps-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});
  await page.reload();await riskStep(page).click();
  await expect(page.getByLabel('Example signal candle low (₹)',{exact:true})).toHaveValue('');
  await expect(page.locator('.strategy-target-row').nth(1)).toContainText('Target 1 price');
  await select(page,'After Target 2 fills, move SL to','Keep current stop');
  await select(page,'After Target 1 fills, move SL to','Keep current stop');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(state.writes).toBe(2);
  expect(state.saved().risk.exitTargets?.map(t=>t.moveStopTo)).toEqual([undefined,undefined,undefined]);
  await page.reload();await riskStep(page).click();
  await expect(page.locator('.strategy-target-row').nth(0)).toContainText('Keep current stop');
  await expect(page.locator('.strategy-target-row').nth(1)).toContainText('Keep current stop');
});

test('ATR explanation and connected preview match the settings without saving example prices', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const initial = record(); initial.risk.atrMultiplier = 2.5;
  const state = await fixture(page, initial);
  await page.goto('/strategies?rule=' + id); await riskStep(page).click();
  await expect(page.getByText('Uses 14 completed daily candles.', { exact: false })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Move stop to entry', exact: true })).not.toBeVisible();
  await page.getByLabel('Reference entry price (₹)', { exact: true }).fill('100');
  await page.getByLabel('Example ATR (₹)', { exact: true }).fill('1.60');
  const example = page.getByRole('region', { name: 'Example calculator' });
  await expect(example.getByTestId('initial-risk-preview')).toContainText('Initial SL ₹96.00');
  await expect(example.getByTestId('initial-risk-preview')).toContainText('1R ₹4.00');
  await expect(example).toContainText('250 whole shares');
  await expect(example).toContainText('₹108.00');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByText('Move or trail the stop-loss', { exact: true }).click();
  await page.getByRole('switch', { name: 'Move stop to entry', exact: true }).click();
  await expect(example).toContainText('At ₹104.00, move the stop to ₹100.00');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(1);
  expect(state.saved().risk.stopMode).toBe('ATR');
  expect(state.saved().risk.stopValue).toBeUndefined();
  expect(state.saved().risk.entryLimitPrice).toBeUndefined();
  expect(JSON.stringify(state.saved())).not.toMatch(/referenceEntry|referenceStop|exampleAtr/);
  await example.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('risk-example-light.png') });
  await page.getByLabel('Dark theme', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await example.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('risk-example-dark.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await example.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('risk-example-mobile.png') });
  await page.reload(); await riskStep(page).click();
  await expect(page.getByLabel('Reference entry price (₹)', { exact: true })).toHaveValue('');
  await expect(page.getByRole('switch', { name: 'Move stop to entry', exact: true })).toBeChecked();
});

test('maximum stop distance saves, explains skipped candle-low entries and can be removed', async ({ page }, testInfo) => {
  const initial=record(); initial.risk.stopMode='candleLow';
  const state=await fixture(page,initial);
  await page.goto('/strategies?rule='+id);await riskStep(page).click();
  const limit=page.getByLabel('Maximum initial stop distance (%) · optional',{exact:true});
  await limit.fill('3');
  await page.getByLabel('Reference entry price (₹)',{exact:true}).fill('100');
  await page.getByLabel('Example signal candle low (₹)',{exact:true}).fill('96');
  const example=page.getByRole('region',{name:'Example calculator'});
  await expect(example).toContainText('This entry would be skipped');
  await expect(example).toContainText('4.00%');
  await expect(example).toContainText('No shares would be bought');
  await page.getByLabel('Example signal candle low (₹)',{exact:true}).fill('97');
  await expect(example.getByTestId('initial-risk-preview')).toContainText('Initial SL ₹97.00');
  await expect(example).not.toContainText('This entry would be skipped');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(state.writes).toBe(1); expect(state.saved().risk.maxStopPercent).toBe(3);
  await page.reload(); await riskStep(page).click(); await expect(limit).toHaveValue('3.00');
  await page.getByRole('region',{name:'Initial stop-loss',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('maximum-stop-distance.png')});
  await limit.clear();await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(state.writes).toBe(2);expect(state.saved().risk.maxStopPercent).toBeUndefined();
  expect(state.saved().risk.stopMode).toBe('candleLow');
});

test('saved trailing-from-entry and legacy breakeven retain behaviour and switch explicitly to delayed trailing', async ({ page }) => {
  const initial = record();
  initial.risk = { ...initial.risk, stopMode: 'trailing', stopPercent: 4, breakevenAfterTarget1: true,
    exitTargets: [{ profitPercent: 8, closePercent: 30 }, { profitPercent: 16, closePercent: 30 }, { profitPercent: 20, closePercent: 40 }] };
  const state = await fixture(page, initial);
  await page.goto('/strategies?rule=' + id); await riskStep(page).click();
  await expect(page.getByLabel('Initial stop method', { exact: true })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Trail the remaining position', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Move to entry after', { exact: true }).locator('..')).toContainText('Target 1 fills');
  // Saving an unrelated change must not rewrite legacy stop semantics.
  await page.getByLabel('Max open positions', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(1);
  expect(state.saved().risk).toEqual({ ...initial.risk, maxPositions: 3 });
  await select(page, 'Start trailing', 'After a profit level or target · R distance');
  await expect(page.getByLabel('Initial stop method', { exact: true })).toBeEnabled();
  await page.getByLabel('Start trailing at profit (R)', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(2);
  expect(state.saved().risk).toMatchObject({ stopMode: 'fixed', stopPercent: 4, breakevenAfterTarget1: false,
    stopManagement: { breakeven: { trigger: 'target', at: 1 }, trailing: { trigger: 'risk', at: 3, distanceR: 1 } } });
  await page.reload(); await riskStep(page).click();
  await expect(page.getByLabel('Start trailing at profit (R)', { exact: true })).toHaveValue(/^3(?:\.0+)?$/);
  await select(page, 'Start trailing', 'From entry · percentage distance');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(3);
  expect(state.saved().risk.stopMode).toBe('trailing');
  expect(state.saved().risk.stopManagement?.trailing).toBeUndefined();
  expect(state.saved().risk.stopManagement?.breakeven).toEqual({ trigger: 'target', at: 1 });
  await page.reload(); await riskStep(page).click();
  await page.getByRole('switch', { name: 'Trail the remaining position', exact: true }).click();
  await page.getByRole('switch', { name: 'Move stop to entry', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(4);
  expect(state.saved().risk.stopMode).toBe('fixed');
  expect(state.saved().risk.stopManagement).toBeUndefined();
  expect(state.saved().risk.breakevenAfterTarget1).toBe(false);
});

test('removing a target cannot silently change a stop activation to a different target', async ({ page }) => {
  const initial = record();
  initial.risk.exitTargets = [{ basis: 'risk', value: 2, closePercent: 30 }, { basis: 'risk', value: 4, closePercent: 30 }, { basis: 'risk', value: 5, closePercent: 40 }];
  initial.risk.stopManagement = { trailing: { trigger: 'target', at: 2, distanceR: 1 } };
  const state = await fixture(page, initial);
  await page.goto('/strategies?rule=' + id); await riskStep(page).click();
  await expect(page.getByRole('button', { name: 'Remove Target 1', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove Target 2', exact: true })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Single target', exact: true })).toBeDisabled();
  await page.locator('#stop-trailing-trigger').click();
  await page.locator('.ant-select-dropdown').getByText('Price reaches a profit multiple (R)', { exact: true }).click();
  await page.getByRole('button', { name: 'Remove Target 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(1);
  expect(state.saved().risk.exitTargets?.map(t => t.value)).toEqual([4, 5]);
  expect(state.saved().risk.stopManagement?.trailing).toEqual({ trigger: 'risk', at: 1, distanceR: 1 });
});

test('a pending save locks editing until the saved response has been applied', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const state = await fixture(page, record(), () => gate);
  await page.goto('/strategies?rule=' + id); await riskStep(page).click();
  await page.getByLabel('Max open positions', { exact: true }).fill('3');
  await page.getByText('Move or trail the stop-loss', { exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  try {
    await expect.poll(state.writes).toBe(1);
    await expect(page.getByLabel('Max open positions', { exact: true })).toBeDisabled();
    await expect(page.getByRole('switch', { name: 'Move stop to entry', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'AI assistant', exact: true })).toBeDisabled();
    await expect(riskStep(page)).toBeDisabled();
  } finally { release(); }
  await expect(page.getByLabel('Max open positions', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Max open positions', { exact: true })).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByLabel('Max open positions', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(2);
  expect(state.saved().risk.maxPositions).toBe(5);
});

test('fixed-price plans identify shared prices during both backtest and signal-runner stock selection', async ({ page }) => {
  const initial = record();
  initial.risk = { ...initial.risk, entryOrderType: 'limit', entryLimitPrice: 100, stopMode: 'price', stopValue: 96 };
  await fixture(page, initial);
  await page.goto('/strategies?tab=backtests&rule=' + id);
  await page.getByRole('button', { name: 'Select first 10', exact: true }).click();
  await expect(page.getByText('The same fixed prices will apply to all 2 selected stocks', { exact: true })).toBeVisible();
  await expect(page.getByText(/Buy limit ₹100.00 · Initial SL ₹96.00/)).toBeVisible();
  await page.goto('/signal-runner?setup=1&strategy=' + id);
  await page.getByRole('button', { name: 'Select first 10', exact: true }).click();
  await expect(page.getByText('The same fixed prices will apply to all 2 selected stocks', { exact: true })).toBeVisible();
  await page.locator('.stock-scope-actions').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('The same fixed prices will apply to all 2 selected stocks', { exact: true })).toHaveCount(0);
});
