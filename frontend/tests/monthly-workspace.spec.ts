import { expect, test } from '@playwright/test';
import { initialMonthlyRule, newMonthlyCondition } from '../src/modules/qualification/config/monthlyFields';

const capabilities = { monthlyFields: ['marketCap', 'debtEquity', 'pledge', 'delivery', 'tradedValue', 'ema5', 'ema21'],
  technical: ['ema5', 'ema21'], snapshotFields: ['marketCap', 'debtEquity', 'pledge', 'delivery', 'tradedValue'], choices: { sector: [], index: [] } };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/status', route => route.fulfill({ json: { configured: true, provider: 'Gemini', model: 'fixture' } }));
  await page.route('**/api/ai/proposals', route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: { text: input.prompt.includes('intraday') ? 'Use Algo Strategies for intraday rules.' : 'Here are your monthly conditions.', assumptions: [], provider: 'Gemini', model: 'fixture',
      proposal: input.prompt.includes('intraday') ? null : { ...initialMonthlyRule, groups: [{ logic: 'AND', conditions: [
        { ...newMonthlyCondition('ema5'), operator: 'gt', operand: 'field', compareField: 'ema21' },
        { ...newMonthlyCondition('delivery'), value: input.prompt.includes('50') ? 50 : 40 },
      ] }] },
    } });
  });
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', canRun: true,
    rule: { rule: initialMonthlyRule, revision: 1, fingerprint: 'fixture' }, universe: null, runs: [],
    readiness: { companies: 5458, checkedAt: new Date().toISOString(), fields: [
      { field: 'ema5', kind: 'history', withData: 0 }, { field: 'marketCap', kind: 'fact', withData: 0 },
    ] },
  } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: [] }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: capabilities }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
});

test('full navigation stays available on backend pages and Dashboard opens without role login', async ({ page }) => {
  await page.goto('/qualification?tab=rules');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Dashboard', 'Indices', 'Qualification', 'Algo Strategies', 'Signal Runner', 'Paper Trading', 'Subscribers', 'Risk Management', 'Compliance', 'Audit Logs', 'Connections & Data', 'Settings']) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(1);
  }
  await nav.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('heading', { name: /Good morning/ })).toBeVisible();
  await expect(page.getByText('Mock data only', { exact: false }).first()).toBeVisible();
  await nav.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
  await nav.getByRole('link', { name: 'Audit Logs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Audit Logs', level: 1 })).toBeVisible();
});

test('monthly AI suggestions preserve the manual builder and never save or scan on apply', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (['POST', 'PUT'].includes(request.method()) && request.url().includes('/qualification')) writes.push(request.url()); });
  await page.goto('/qualification?tab=rules');
  await expect(page.getByText('Some data required by your saved rule is missing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();
  await expect(page.locator('.monthly-condition')).toHaveCount(6);
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Gemini', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Monthly trend', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Monthly suggestion preview' })).toContainText('EMA 21');
  await dialog.getByRole('textbox', { name: 'Message the monthly assistant' }).fill('Change delivery to 50% and keep everything else');
  const refinement = page.waitForRequest(request => request.url().endsWith('/api/ai/proposals'));
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  const input = (await refinement).postDataJSON();
  expect(input.currentDraft.groups[0].conditions).toHaveLength(2);
  expect(input.messages).toHaveLength(2);
  await expect(dialog.getByRole('region', { name: 'Monthly suggestion preview' })).toContainText('50%');
  await dialog.getByRole('button', { name: 'Apply to builder' }).click();
  await expect(page.locator('.monthly-condition')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Message the monthly assistant' }).fill('Use intraday VWAP on 5 minute candles');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(dialog.getByRole('log')).toContainText('Use Algo Strategies');
  await expect(dialog.getByRole('button', { name: 'Apply to builder' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Back to builder' }).click();
  await expect(page.locator('.monthly-condition')).toHaveCount(2);
  expect(writes).toEqual([]);
});

test('AI provider failures preserve manual rules and cannot be applied', async ({ page }) => {
  await page.route('**/api/ai/proposals', route => route.fulfill({ status: 429, json: { message: 'Gemini usage limit reached. Please wait before retrying.' } }));
  await page.goto('/qualification?tab=rules');
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Monthly trend', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Gemini usage limit reached');
  await expect(page.getByRole('button', { name: 'Apply to builder' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to builder' }).click();
  await expect(page.locator('.monthly-condition')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();
});

test('monthly assistant remains usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/qualification?tab=rules');
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Liquid stocks', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Apply to builder' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('stopping generation ignores a late proposal and preserves the manual draft', async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/ai/proposals', async route => {
    await pending;
    await route.fulfill({ json: { text: 'Late proposal', assumptions: [], proposal: initialMonthlyRule, provider: 'Gemini', model: 'fixture' } }).catch(() => {});
  });
  await page.goto('/qualification?tab=rules');
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Monthly trend', exact: true }).click();
  await page.getByRole('button', { name: 'Stop generating' }).click();
  finish();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Apply to builder' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to builder' }).click();
  await expect(page.locator('.monthly-condition')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();
});

test('failed monthly follow-ups preserve the last valid suggestion and its refinement context', async ({ page }) => {
  await page.goto('/qualification?tab=rules');
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  const dialog = page.getByRole('dialog'), preview = dialog.getByRole('region', { name: 'Monthly suggestion preview' });
  await dialog.getByRole('button', { name: 'Monthly trend', exact: true }).click();
  await expect(preview).toContainText('40%');
  await page.route('**/api/ai/proposals', route => route.fulfill({ status: 429, json: { message: 'Gemini usage limit reached. Retry shortly.' } }));
  await dialog.getByRole('textbox', { name: 'Message the monthly assistant' }).fill('Change delivery to 50%');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(dialog).toContainText('Gemini usage limit reached');
  await expect(preview).toContainText('40%');
  await expect(preview).toContainText('Previous suggestion retained');
  await expect(dialog.getByRole('button', { name: 'Apply to builder' })).toBeEnabled();
  await expect(dialog.getByRole('textbox', { name: 'Message the monthly assistant' })).toHaveValue('Change delivery to 50%');
  await dialog.getByRole('button', { name: 'Apply to builder' }).click();
  await expect(page.locator('.monthly-condition')).toHaveCount(2);
});
