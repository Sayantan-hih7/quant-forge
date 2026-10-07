import { respondToStrategyReview } from './helpers/strategyReview';
import { test, expect, type Page } from '@playwright/test';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import { backtestSetupSchema } from '../src/modules/backtesting/schemas/backendBacktestSchema';
import type { SavedStrategy } from '../src/modules/strategies/hooks/useBackendStrategies';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stock = { _id: 'NSE:1', symbol: 'SAVEDSTOCK', exchange: 'NSE', source: 'scan' };
const record = (): SavedStrategy => ({ ...sampleTradingPlan('swing'), _id: id, revision: 2, savedAt: new Date().toISOString() });
const editorStep = (page: Page, text: string) => page.getByRole('navigation', { name: 'Strategy editor steps' }).getByRole('button', { name: text });

test('partial exit editor validates, saves and reloads the complete target plan', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  let saved = record();
  const writes: unknown[] = [];
  await page.route('**/api/strategies', route => route.fulfill({ json: [saved] }));
  await page.route('**/api/strategies/*', route => {
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route);
    const input = route.request().postDataJSON(); writes.push(input);
    saved = { ...input.draft, _id: id, revision: 3, savedAt: new Date().toISOString() };
    return route.fulfill({ json: saved });
  });
  await page.goto('/strategies?rule=' + id);
  await editorStep(page, '4 Risk').click();
  await page.getByText('Partial exits', { exact: true }).click();
  await page.getByLabel('Target 1 close (%)', { exact: true }).fill('40');
  await expect(page.getByLabel('Target 2 close (%)', { exact: true })).toHaveValue('60');
  await page.getByRole('button', { name: 'Add target', exact: true }).click();
  await expect(page.getByLabel('Target 3 close (%)', { exact: true })).toHaveValue('30');
  await page.getByRole('button', { name: 'Remove Target 2', exact: true }).click();
  await expect(page.getByLabel('Target 2 close (%)', { exact: true })).toHaveValue('60');
  await page.getByText('Move or trail the stop-loss', { exact: true }).click();
  await page.getByRole('switch', { name: 'Move stop to entry', exact: true }).click();
  await page.getByLabel('Target 2 gain (%)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Each target must be higher than the previous target.').first()).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel('Target 2 gain (%)', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Next: Review & save', exact: true }).click();
  await expect(page.getByText('T1 +2%', { exact: true })).toBeVisible();
  await expect(page.getByText('T2 +5%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to backtest' })).toBeVisible();
  expect(writes).toMatchObject([{ draft: { risk: { exitTargets: [{ profitPercent: 2, closePercent: 40 }, { profitPercent: 5, closePercent: 60 }], stopManagement: { breakeven: { trigger: 'risk', at: 1 } } } } }]);
  await page.reload();
  await editorStep(page, '4 Risk').click();
  await expect(page.getByLabel('Target 1 close (%)', { exact: true })).toHaveValue('40');
  await expect(page.getByRole('switch', { name: 'Move stop to entry', exact: true })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('partial-targets-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('Single target', { exact: true }).click();
  await expect(page.getByLabel('Profit target (R)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(saved.risk.exitTargets).toBeUndefined();
  expect(saved.risk.breakevenAfterTarget1).toBe(false);
});
test.beforeEach(async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', route => route.fulfill({ json: [record()] }));
  await page.route('**/api/strategies/*', route => route.fulfill({ status: 503, json: { message: 'Test save failure' } }));
  await page.route('**/api/backtests**', route => route.fulfill({ json: route.request().url().includes('/universe') ? { stocks: [stock], listCount: 1 } : [] }));
  await page.route('**/api/paper', route => route.fulfill({ json: { sessions: [], positions: [], orders: [], signals: [], workerRunning: true, feed: { state: 'offline', message: 'Fixture feed offline' } } }));
  // These tests must never start monitoring or write orders in the user's workspace.
  await page.route('**/api/paper/sessions', route => route.fulfill({ status: 500, json: { message: 'Unexpected session creation' } }));
});

test('new manual strategy completes both sides, validates and saves only on explicit create', async ({ page }) => {
  const writes: unknown[] = [];
  await page.route('**/api/strategies/*', route => {
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route);
    if (route.request().method() !== 'PUT') return route.fulfill({ json: [] });
    const input = route.request().postDataJSON(); writes.push(input);
    return route.fulfill({ json: { ...input.draft, _id: route.request().url().split('/').at(-1), revision: 1, savedAt: new Date().toISOString() } });
  });
  await page.goto('/strategies');
  await expect(page.getByRole('region', { name: 'Saved strategies' })).toBeVisible();
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await page.getByRole('dialog').getByText('Swing', { exact: true }).click();
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  await page.getByLabel('Strategy name', { exact: true }).fill('My daily strategy');
  await page.getByRole('button', { name: 'Next: Buy rules', exact: true }).click();
  await expect(page.locator('.condition-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add condition', exact: true }).click();
  await expect(page.getByLabel('Timeframe', { exact: true }).locator('..')).toContainText('Daily');
  await page.getByRole('button', { name: 'Next: Sell rules', exact: true }).click();
  await page.getByRole('button', { name: 'Add condition', exact: true }).click();
  await page.getByRole('button', { name: 'Next: Risk', exact: true }).click();
  await page.getByLabel('Risk per trade (%)', { exact: true }).fill('0.5');
  await page.getByRole('button', { name: 'Next: Review & save', exact: true }).click();
  expect(writes).toHaveLength(0);
  await expect(page.getByRole('region', { name: 'Buy rules', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sell rules', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create strategy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to backtest' })).toBeVisible();
  expect(writes).toMatchObject([{ expectedRevision: 0, draft: { name: 'My daily strategy', entry: { side: 'BUY', cadence: 'daily' }, exit: { side: 'SELL', cadence: 'daily' }, risk: { riskPercent: 0.5 } } }]);
});

test('failed save retains edits but newer saved revision opens first with recoverable local backup', async ({ page }) => {
  await page.goto('/strategies?rule=' + id + '&mode=edit');
  await page.getByLabel('Strategy name', { exact: true }).fill('Unsaved local name');
  await expect(page.getByRole('tab', { name: 'Backtests', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Strategy was not saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('Unsaved local name');
  await page.route('**/api/strategies', route => route.fulfill({ json: [{ ...record(), name: 'Saved elsewhere', revision: 3 }] }));
  await page.reload();
  await expect(page.getByText('A newer saved strategy exists')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();

  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('Saved elsewhere');
  await expect(page.getByRole('tab', { name: 'Backtests', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('Saved elsewhere');
  await page.getByRole('button',{name:'Older local drafts (1)',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Unsaved local name');
  await page.getByRole('button',{name:'Use as unsaved draft',exact:true}).click();
  await expect(page.getByLabel('Strategy name',{exact:true})).toHaveValue('Unsaved local name');
  await expect(page.getByText('A newer saved strategy exists')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();
});

test('draft navigation preserves changes, and duplicating never overwrites a saved strategy', async ({ page }) => {
  await page.goto('/strategies');
  await page.getByRole('button', { name: /Duplicate/ }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue(/Copy/);
  await page.getByLabel('Strategy name', { exact: true }).fill('Unfinished copy');
  await page.getByRole('button', { name: 'All strategies', exact: true }).click();
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('Unfinished copy');
  await editorStep(page, '2 Buy rules').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('target units preview, convert, validate and persist editable rupee values', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  let saved = record(), writes = 0;
  await page.route('**/api/strategies', route => route.fulfill({ json: [saved] }));
  await page.route('**/api/strategies/*', route => {
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route);
    saved = { ...route.request().postDataJSON().draft, _id: id, revision: ++writes + 2, savedAt: new Date().toISOString() };
    return route.fulfill({ json: saved });
  });
  const selectUnit = async (label: string) => {
    await page.getByLabel('Enter targets as', { exact: true }).click();
    await page.locator('.ant-select-dropdown').getByText(label, { exact: true }).click();
  };
  await page.goto('/strategies?rule=' + id);
  await editorStep(page, '4 Risk').click();
  await page.getByText('Partial exits', { exact: true }).click();
  await page.getByLabel('Reference entry price (₹)', { exact: true }).fill('500');
  await expect(page.getByTestId('target-1-equivalent')).toContainText('Target ₹510.00 · +₹10.00 / share · +2.00%');
  await selectUnit('Gain per share (₹)');
  await expect(page.getByLabel('Target 1 gain per share (₹)', { exact: true })).toHaveValue('10.00');
  await expect(page.getByLabel('Target 2 gain per share (₹)', { exact: true })).toHaveValue('20.00');
  await page.getByLabel('Target 1 gain per share (₹)', { exact: true }).fill('15');
  await page.getByLabel('Target 2 gain per share (₹)', { exact: true }).fill('30');
  await expect(page.getByTestId('target-1-equivalent')).toContainText('+3.00%');
  await selectUnit('Exact target price (₹)');
  await expect(page.getByLabel('Target 1 price (₹)', { exact: true })).toHaveValue('515.00');
  await expect(page.getByLabel('Target 2 price (₹)', { exact: true })).toHaveValue('530.00');
  await page.getByLabel('Target 1 price (₹)', { exact: true }).fill('520');
  await page.getByLabel('Target 2 price (₹)', { exact: true }).fill('550');
  await page.getByRole('button', { name: 'Next: Review & save', exact: true }).click();
  await expect(page.getByText('T1 at ₹520.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to backtest' })).toBeVisible();
  expect(saved.risk.exitTargets).toEqual([{ basis: 'price', value: 520, closePercent: 50 }, { basis: 'price', value: 550, closePercent: 50 }]);
  await page.reload();
  await editorStep(page, '4 Risk').click();
  await expect(page.getByLabel('Target 1 price (₹)', { exact: true })).toHaveValue('520.00');
  await expect(page.getByLabel('Reference entry price (₹)', { exact: true })).toHaveValue('');
  await page.getByLabel('Reference entry price (₹)', { exact: true }).fill('500');
  await expect(page.getByTestId('target-2-equivalent')).toContainText('+10.00%');
  await page.screenshot({ path: testInfo.outputPath('target-currency-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('target-currency-mobile.png'), fullPage: true });
  await page.getByLabel('Reference entry price (₹)', { exact: true }).fill('');
  await selectUnit('Gain per share (₹)');
  await expect(page.getByLabel('Target 1 gain per share (₹)', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Enter a rupee value.').first()).toBeVisible();
  expect(writes).toBe(1);
  await page.getByLabel('Target 1 gain per share (₹)', { exact: true }).fill('12.50');
  await page.getByLabel('Target 2 gain per share (₹)', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => writes).toBe(2);
  expect(saved.risk.exitTargets).toEqual([{ basis: 'amount', value: 12.5, closePercent: 50 }, { basis: 'amount', value: 25, closePercent: 50 }]);
  await page.reload();
  await editorStep(page, '4 Risk').click();
  await expect(page.getByLabel('Target 1 gain per share (₹)', { exact: true })).toHaveValue('12.50');
  await page.getByLabel('Reference entry price (₹)', { exact: true }).fill('500');
  await selectUnit('Gain (%)');
  await expect(page.getByLabel('Target 1 gain (%)', { exact: true })).toHaveValue('2.50');
  await expect(page.getByLabel('Target 2 gain (%)', { exact: true })).toHaveValue('5.00');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => writes).toBe(3);
  expect(saved.risk.exitTargets).toEqual([{ basis: 'percent', profitPercent: 2.5, closePercent: 50 }, { basis: 'percent', profitPercent: 5, closePercent: 50 }]);
});

test('paper positions show the remaining shares, filled targets and breakeven stop', async ({ page }) => {
  const strategy = record();
  strategy.risk.exitTargets = [{ profitPercent: 2, closePercent: 40 }, { profitPercent: 5, closePercent: 60 }];
  strategy.risk.breakevenAfterTarget1 = true;
  await page.route('**/api/paper', route => route.fulfill({ json: {
    workerRunning: true, feed: { state: 'offline', message: 'Fixture feed' }, signals: [], orders: [],
    sessions: [{ _id: 'paper-fixture', strategy, mode: 'automatic', cashPaise: 9408000, initialPaise: 10000000, bookedPnlPaise: 8000, entriesPaused: false, active: true }],
    positions: [{ _id: 'position-fixture', sessionId: 'paper-fixture', instrumentId: stock._id, symbol: stock.symbol, quantity: 60, initialQuantity: 100, entryPaise: 10000, stopPaise: 10000, targetPaise: 10500, breakevenActivated: true,
      mark: { pricePaise: 10300, valuePaise: 618000, unrealizedPaise: 18000, at: '2026-09-25T09:00:00Z', fresh: false, source: 'dhan' },
      targets: [{ pricePaise: 10200, quantity: 40, completed: true, filledQuantity: 40 }, { pricePaise: 10500, quantity: 60, completed: false }] }],
  } }));
  await page.goto('/paper-trading');
  await expect(page.getByRole('cell', { name: '60 / 100', exact: true })).toBeVisible();
  await expect(page.getByText('At entry or higher', { exact: true })).toBeVisible();
  await expect(page.getByText(/40 sold/, { exact: false })).toBeVisible();
  await expect(page.getByText(/60 shares.*remainder/, { exact: false })).toBeVisible();
  await expect(page.getByText('Last received', { exact: true })).toBeVisible();
  await expect(page.getByText('₹180', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Realized P&L', exact: true })).toBeVisible();
});

test('R targets, limit entry and staged stop management save and reload together', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  let saved=record(), writes=0;
  await page.route('**/api/strategies', route=>route.fulfill({json:[saved]}));
  await page.route('**/api/strategies/*', route=>{
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route);
    saved={...route.request().postDataJSON().draft,_id:id,revision:++writes+2,savedAt:new Date().toISOString()};
    return route.fulfill({json:saved});
  });
  const select=async(label:string,option:string)=>{
    await page.getByLabel(label,{exact:true}).click();
    await page.locator('.ant-select-dropdown').getByText(option,{exact:true}).click();
  };
  await page.goto('/strategies?rule='+id);
  await editorStep(page,'4 Risk').click();
  await select('Buy order','Limit · my maximum buy price');
  await page.getByLabel('Maximum entry price (₹)',{exact:true}).fill('100');
  await select('Initial stop method','Exact stop price');
  await page.getByLabel('Initial stop price (₹)',{exact:true}).fill('96');
  await page.getByText('Partial exits',{exact:true}).click();
  await page.getByLabel('Reference entry price (₹)',{exact:true}).fill('100');
  await select('Enter targets as','Initial risk (R)');
  await page.getByLabel('Target 1 multiple (R)',{exact:true}).fill('2');
  await page.getByLabel('Target 2 multiple (R)',{exact:true}).fill('4');
  await page.getByLabel('Target 1 close (%)',{exact:true}).fill('30');
  await page.getByRole('button',{name:'Add target',exact:true}).click();
  await page.getByLabel('Target 2 close (%)',{exact:true}).fill('30');
  await page.getByLabel('Target 3 multiple (R)',{exact:true}).fill('5');
  await expect(page.getByLabel('Target 3 close (%)',{exact:true})).toHaveValue('40');
  await expect(page.getByTestId('initial-risk-preview')).toContainText('1R ₹4.00');
  for(const [n,price] of [[1,'108'],[2,'116'],[3,'120']] as const)
    await expect(page.getByTestId('target-'+n+'-equivalent')).toContainText('Target ₹'+price+'.00');
  await page.getByText('Move or trail the stop-loss',{exact:true}).click();
  await page.getByRole('switch',{name:'Move stop to entry',exact:true}).click();
  await page.getByRole('switch',{name:'Trail the remaining position',exact:true}).click();
  await page.locator('#stop-trailing-trigger').click();
  await page.locator('.ant-select-dropdown').getByText('A partial target fills',{exact:true}).click();
  await expect(page.getByLabel('Move to entry at profit (R)',{exact:true})).toHaveValue(/^1(?:\.0+)?$/);
  await page.getByRole('button',{name:'Next: Review & save',exact:true}).click();
  await expect(page.getByText('T1 2R',{exact:true})).toBeVisible();
  await expect(page.getByText('Move SL to entry at +1R.',{exact:true})).toBeVisible();
  await expect(page.getByText('Trail by 1R after Target 1 fills.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save strategy',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue to backtest'})).toBeVisible();
  expect(saved.risk).toMatchObject({entryOrderType:'limit',entryLimitPrice:100,stopMode:'price',stopValue:96,
    exitTargets:[{basis:'risk',value:2,closePercent:30},{basis:'risk',value:4,closePercent:30},{basis:'risk',value:5,closePercent:40}],
    stopManagement:{breakeven:{trigger:'risk',at:1},trailing:{trigger:'target',at:1,distanceR:1}}});
  await page.reload();await editorStep(page,'4 Risk').click();
  await expect(page.getByLabel('Maximum entry price (₹)',{exact:true})).toHaveValue('100.00');
  await expect(page.getByLabel('Initial stop price (₹)',{exact:true})).toHaveValue('96.00');
  await expect(page.getByRole('switch',{name:'Trail the remaining position',exact:true})).toBeChecked();
  await page.getByLabel('Reference entry price (₹)',{exact:true}).fill('100');
  await page.getByRole('region',{name:'Profit-taking plan'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('r-targets.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Editing an existing plan can turn trailing off without an old saved default returning.
  await page.getByRole('switch',{name:'Trail the remaining position',exact:true}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(()=>writes).toBe(2);
  expect(saved.risk.stopManagement?.trailing).toBeUndefined();
  expect(saved.risk.stopManagement?.breakeven).toEqual({trigger:'risk',at:1});
  // Removed stop/entry fields must not return from saved RHF defaults.
  await select('Buy order','Market · next available price');
  await select('Initial stop method','Fixed percentage');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(()=>writes).toBe(3);
  expect(saved.risk.entryLimitPrice).toBeUndefined();
  expect(saved.risk.stopValue).toBeUndefined();
});

test('an unchanged draft from the old editor does not falsely report a version conflict', async ({ page }) => {
  const { name, entry, exit, risk } = record();
  await page.addInitScript(({ id, draft }) => localStorage.setItem('quantforge-strategy-chat', JSON.stringify({ version: 2, state: { conversations: { ['backend-local:' + id]: { messages: [], draft } } } })), { id, draft: { name, entry, exit, risk } });
  await page.goto('/strategies?rule=' + id + '&mode=edit');
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue(name);
  await expect(page.getByText('A newer saved strategy exists')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Backtests', exact: true })).toBeEnabled();
});

test('backtest scope load errors are recoverable and stock selection must match the scope', async ({ page }) => {
  let failed = true;
  await page.route('**/api/backtests/universe?**', route => failed ? route.fulfill({ status: 503, json: { message: 'Temporary data error' } }) : route.fulfill({ json: { stocks: [stock], listCount: 1 } }));
  await page.goto(`/strategies?tab=backtests&rule=${id}`);
  await expect(page.getByText('Stock list could not be loaded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run backtest', exact: true })).toBeDisabled();
  failed = false;
  await page.getByRole('button', { name: 'Retry stock list' }).click();
  await page.getByRole('button', { name: 'Select first 10' }).click();
  await page.getByLabel('Which qualified list?', { exact: true }).click();
  await page.route('**/api/backtests/universe?**', route => route.fulfill({ json: { stocks: [], listCount: 0 } }));
  await page.getByText('Historical lists · as published at that time', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run backtest', exact: true })).toBeDisabled();
  await expect(page.getByText('0 selected / 0 available', { exact: true })).toBeVisible();
});

test('signal inspection evaluates both sides, places no orders and expires when selection changes', async ({ page }) => {
  let sessionWrites = 0;
  page.on('request', request => { if (request.url().endsWith('/paper/sessions')) sessionWrites++; });
  await page.route('**/api/paper/preview', route => route.fulfill({ json: { strategyId: id, revision: 2, checkedAt: new Date().toISOString(), feed: { state: 'offline', message: 'Offline' }, results: [{ id: stock._id, symbol: stock.symbol, barEnd: '2026-09-24T10:00:00Z', freshQuote: false, entry: { matched: true, checks: [] }, exit: { matched: false, checks: [] } }] } }));
  await page.goto('/signal-runner?setup=1&strategy=' + id);
  await page.getByRole('button', { name: 'Select first 10' }).click();
  await page.getByText('Optional: inspect the latest saved candle', {exact:true}).click();
  await page.getByRole('button', { name: 'Inspect buy & sell rules', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Buy rules', exact:true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sell rules', exact:true })).toBeVisible();
  await expect(page.getByText('Met', { exact: true })).toBeVisible();
  expect(sessionWrites).toBe(0);
  await page.locator('.stock-scope-actions').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved candle rule results' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start signals',exact:true })).toBeDisabled();
});

test('backtest validation enforces completed dates and intraday length before submission', () => {
  const data = { dataPolicy:'ready', strategyId: id, from: '2025-01-01', to: '2025-05-01', universe: 'current', includeManual: false, acknowledgeSelectionBias: true, ids: [stock._id] };
  expect(backtestSetupSchema(false).safeParse(data).success).toBe(false);
  expect(backtestSetupSchema(true).safeParse(data).success).toBe(true);
  expect(backtestSetupSchema(true).safeParse({ ...data, to: '2099-01-01' }).success).toBe(false);
});

test('a queued backtest keeps its setup, opens a report explicitly, and warns about changed rules on handoff', async ({ page }) => {
  const runId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const run = { _id: runId, strategy: { ...record(), revision: 1 }, status: 'completed', createdAt: new Date().toISOString(),
    config: { from: '2025-01-01T00:00:00+05:30', to: '2025-02-01T00:00:00+05:30', universe: 'current', includeManual: false, ids: [stock._id, 'NSE:2'] },
    result: { initialCapital: 100000, equity: 100000, netPnl: 0, maxDrawdownPercent: 0, unavailableDecisions: 0, invalidTargetEntries: 2, returnPercent: 0, winRate: null, profitFactor: null,
      totalFees: 0, realizedPnl: 0, openPositions: [], curve: [], trades: [], coverage: [], assumptions: ['Fixture test'] } };
  let queued = false;
  await page.route('**/api/backtests**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/universe')) return route.fallback();
    if (route.request().method() === 'POST') { queued = true; return route.fulfill({ status: 202, json: { id: runId } }); }
    return route.fulfill({ json: url.pathname.endsWith(runId) ? run : queued ? [run] : [] });
  });
  await page.goto(`/strategies?tab=backtests&rule=${id}`);
  await page.getByRole('button', { name: 'Select first 10' }).click();
  await page.getByRole('checkbox', { name: "I understand this uses today's list for research" }).check();
  const sent = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/backtests'));
  await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({ strategyId: id, expectedRevision: 2, ids: [stock._id] });
  await expect(page.getByRole('button', { name: 'View report' })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'View report' }).click();
  await expect(page.getByText('This report tested an earlier set of rules')).toBeVisible();
  await expect(page.getByText('2 entries skipped: profit targets were invalid at the entry price')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Use for paper trading' }).click();
  await expect(page.getByText('Strategy changed since this backtest')).toBeVisible();
  await expect(page.getByText('1 selected / 1 available', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start paper trading', exact: true })).toBeDisabled();
});
