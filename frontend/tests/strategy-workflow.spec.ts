import { test, expect, type Page } from '@playwright/test';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import { backtestSetupSchema } from '../src/modules/backtesting/schemas/backendBacktestSchema';
import type { SavedStrategy } from '../src/modules/strategies/hooks/useBackendStrategies';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stock = { _id: 'NSE:1', symbol: 'SAVEDSTOCK', exchange: 'NSE', source: 'scan' };
const record = (): SavedStrategy => ({ ...sampleTradingPlan('swing'), _id: id, revision: 2, savedAt: new Date().toISOString() });
const editorStep = (page: Page, text: string) => page.getByRole('navigation', { name: 'Strategy editor steps' }).getByRole('button', { name: text });
test.beforeEach(async ({ page }) => {
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

test('failed save retains local edits and a later server revision requires explicit reload', async ({ page }) => {
  await page.goto('/strategies?rule=' + id);
  await page.getByLabel('Strategy name', { exact: true }).fill('Unsaved local name');
  await expect(page.getByRole('tab', { name: 'Backtests', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Strategy was not saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('Unsaved local name');
  await page.route('**/api/strategies', route => route.fulfill({ json: [{ ...record(), name: 'Saved elsewhere', revision: 3 }] }));
  await page.reload();
  await expect(page.getByText('A newer saved strategy exists')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reload saved strategy' }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('Saved elsewhere');
  await expect(page.getByRole('tab', { name: 'Backtests', exact: true })).toBeEnabled();
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an unchanged draft from the old editor does not falsely report a version conflict', async ({ page }) => {
  const { name, entry, exit, risk } = record();
  await page.addInitScript(({ id, draft }) => localStorage.setItem('quantforge-strategy-chat', JSON.stringify({ version: 2, state: { conversations: { ['backend-local:' + id]: { messages: [], draft } } } })), { id, draft: { name, entry, exit, risk } });
  await page.goto('/strategies?rule=' + id);
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
  await expect(page.getByText('1 selected stocks are outside this scope')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run backtest', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove unavailable' }).click();
  await expect(page.getByText('0 selected / 0 available', { exact: true })).toBeVisible();
});

test('signal inspection evaluates both sides, places no orders and expires when selection changes', async ({ page }) => {
  let sessionWrites = 0;
  page.on('request', request => { if (request.url().endsWith('/paper/sessions')) sessionWrites++; });
  await page.route('**/api/paper/preview', route => route.fulfill({ json: { strategyId: id, revision: 2, checkedAt: new Date().toISOString(), feed: { state: 'offline', message: 'Offline' }, results: [{ id: stock._id, symbol: stock.symbol, barEnd: '2026-09-24T10:00:00Z', freshQuote: false, entry: { matched: true, checks: [] }, exit: { matched: false, checks: [] } }] } }));
  await page.goto('/signal-runner?strategy=' + id);
  await page.getByRole('button', { name: 'Select first 10' }).click();
  await page.getByRole('button', { name: 'Inspect buy & sell rules', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Buy rules · when not held' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sell rules · when held' })).toBeVisible();
  await expect(page.getByText('Conditions met', { exact: true })).toBeVisible();
  expect(sessionWrites).toBe(0);
  await page.locator('.stock-scope-actions').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved candle rule results' })).toHaveCount(0);
  await page.getByText('Next: set up continuous paper monitoring', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start paper monitoring' })).toBeDisabled();
});

test('backtest validation enforces completed dates and intraday length before submission', () => {
  const data = { strategyId: id, from: '2025-01-01', to: '2025-05-01', universe: 'current', includeManual: false, acknowledgeSelectionBias: true, ids: [stock._id] };
  expect(backtestSetupSchema(false).safeParse(data).success).toBe(false);
  expect(backtestSetupSchema(true).safeParse(data).success).toBe(true);
  expect(backtestSetupSchema(true).safeParse({ ...data, to: '2099-01-01' }).success).toBe(false);
});

test('a queued backtest keeps its setup, opens a report explicitly, and warns about changed rules on handoff', async ({ page }) => {
  const runId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const run = { _id: runId, strategy: { ...record(), revision: 1 }, status: 'completed', createdAt: new Date().toISOString(),
    config: { from: '2025-01-01T00:00:00+05:30', to: '2025-02-01T00:00:00+05:30', universe: 'current', includeManual: false, ids: [stock._id, 'NSE:2'] },
    result: { initialCapital: 100000, equity: 100000, netPnl: 0, maxDrawdownPercent: 0, unavailableDecisions: 0, returnPercent: 0, winRate: null, profitFactor: null,
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'View report' }).click();
  await expect(page.getByText('This report tested an earlier set of rules')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Review in Signal Runner' }).click();
  await expect(page.getByText('The strategy has changed since this backtest')).toBeVisible();
  await expect(page.getByText('1 selected stocks are outside this scope')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect buy & sell rules', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove unavailable' }).click();
  await expect(page.getByRole('button', { name: 'Inspect buy & sell rules', exact: true })).toBeEnabled();
});
