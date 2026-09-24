import { expect, test } from '@playwright/test';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import { tradingPlanSchema } from '../src/modules/strategies/schemas/tradingPlanSchema';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test.beforeEach(async ({ page }) => {
  test.setTimeout(60000);
  let record = { ...sampleTradingPlan('intraday'), _id: id, revision: 1, savedAt: new Date().toISOString() };
  await page.route('**/api/strategies', route => route.fulfill({ json: [record] }));
  await page.route('**/api/strategies/*', route => {
    if (route.request().method() !== 'PUT') return route.fulfill({ json: [] });
    const body = route.request().postDataJSON();
    record = { ...body.draft, _id: route.request().url().split('/').at(-1)!, revision: body.expectedRevision + 1, savedAt: new Date().toISOString() };
    return route.fulfill({ json: record });
  });
  await page.route('**/api/backtests**', route => route.fulfill({ json: [] }));
  await page.route('**/api/ai/status', route => route.fulfill({ json: { configured: true, provider: 'Gemini', model: 'fixture' } }));
  await page.route('**/api/ai/proposals', route => {
    const input = route.request().postDataJSON();
    const draft = input.prompt.includes('0.5') ? { ...input.currentDraft, risk: { ...input.currentDraft.risk, riskPercent: 0.5 } } : sampleTradingPlan('swing');
    return route.fulfill({ json: { text: input.prompt.includes('unknown') ? 'That indicator is not supported. Your builder is unchanged.' : 'Review the paired buy and sell rules.',
      assumptions: ['Paper testing only.'], proposal: input.prompt.includes('unknown') ? null : draft, provider: 'Gemini', model: 'fixture' } });
  });
});

test('paired strategy validation rejects a buy rule used as a sell exit', () => {
  const draft = sampleTradingPlan('intraday');
  expect(tradingPlanSchema.safeParse(draft).success).toBe(true);
  expect(tradingPlanSchema.safeParse({ ...draft, exit: draft.entry }).success).toBe(false);
});

test('manual buy/sell/risk edits save together and keep the backtest route', async ({ page }) => {
  await page.goto('/strategies');
  await expect(page.getByRole('region', { name: 'Trading rule builder' })).toBeVisible();
  await page.getByRole('tab', { name: 'Risk & execution' }).click();
  await page.getByLabel('Risk per trade (%)', { exact: true }).fill('0.5');
  await page.getByRole('tab', { name: /Sell rules/ }).click();
  await page.getByLabel('Threshold (RSI)', { exact: true }).fill('40');
  const saved = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/strategies/'));
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  const data = (await saved).postDataJSON();
  expect(data.draft.entry.side).toBe('BUY'); expect(data.draft.exit.side).toBe('SELL');
  expect(data.draft.risk.riskPercent).toBe(0.5); expect(data.expectedRevision).toBe(1);
  await expect(page.getByRole('button', { name: 'Save strategy', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Backtest strategy', exact: true }).click();
  await expect(page).toHaveURL(/tab=backtests/);
  await expect(page.getByRole('tab', { name: 'Backtests', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('Gemini proposals support follow-ups, explicit apply and reload without automatic saving', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (['PUT', 'POST'].includes(request.method()) && !request.url().includes('/ai/')) writes.push(request.url()); });
  await page.goto('/strategies');
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByLabel('Message the strategy assistant').fill('Create a swing strategy with daily RSI conditions and an exit');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('region', { name: 'AI suggestion preview' })).toContainText('Swing');
  await expect(page.getByRole('region', { name: 'AI suggestion preview' }).getByRole('region', { name: 'Sell rules' })).toBeVisible();
  const sent = page.waitForRequest(request => request.url().endsWith('/api/ai/proposals'));
  await page.getByRole('button', { name: 'risk per trade to 0.5%', exact: true }).click();
  const input = (await sent).postDataJSON();
  expect(input.currentDraft.exit.side).toBe('SELL'); expect(input.messages).toHaveLength(2);
  await expect(page.getByRole('region', { name: 'Strategy risk settings' })).toContainText('0.5%');
  await page.getByRole('button', { name: 'Apply to builder', exact: true }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).not.toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('Strategy name', { exact: true })).not.toHaveValue('');
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByLabel('Message the strategy assistant').fill('Buy on an unknown custom indicator');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('not supported');
  await expect(page.getByRole('button', { name: 'Apply to builder', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to builder', exact: true }).click();
  expect(writes).toEqual([]);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a failed strategy refinement preserves the paired suggestion without changing the manual builder', async ({ page }) => {
  await page.goto('/strategies');
  const original = await page.getByLabel('Strategy name', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Swing strategy', exact: true }).click();
  const preview = page.getByRole('region', { name: 'AI suggestion preview' });
  await expect(preview).toContainText('Swing');
  await page.route('**/api/ai/proposals', route => route.fulfill({ status: 429, json: { message: 'Gemini usage limit reached.' } }));
  await page.getByRole('button', { name: 'risk per trade to 0.5%', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Gemini usage limit reached');
  await expect(preview.getByRole('region', { name: 'Sell rules' })).toBeVisible();
  await expect(preview).toContainText('Swing');
  await expect(page.getByRole('button', { name: 'Apply to builder', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to builder', exact: true }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue(original);
});

test('chat opens on the new draft when starting from an empty strategy list', async ({ page }) => {
  await page.route('**/api/strategies', route => route.fulfill({ json: [] }));
  await page.goto('/strategies');
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Message the strategy assistant' }).fill('Create a paper strategy with daily momentum buy rules, sell rules and a fixed stop. Keep it suitable for paper testing, with both sides editable in the builder.');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'AI suggestion preview' })).toContainText('Swing');
  await expect(dialog.getByRole('button', { name: 'Apply to builder' })).toBeEnabled();
});
