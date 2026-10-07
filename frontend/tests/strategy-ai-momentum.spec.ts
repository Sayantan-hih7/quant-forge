import { respondToStrategyReview } from './helpers/strategyReview';
import { test, expect } from '@playwright/test';
import { mondayPrompt, momentumProposal, turnoverQuestion } from '../../backend/test/fixtures/ai-momentum';
import { tradingPlanSchema } from '../src/modules/strategies/schemas/tradingPlanSchema';

const proposal = tradingPlanSchema.parse({ name: momentumProposal.name, risk: momentumProposal.risk,
  entry: { ...momentumProposal.entry, name: 'Momentum buy', description: '', tier: 'tactical', side: 'BUY', horizon: 'intraday', cadence: '15m' },
  exit: { ...momentumProposal.exit, name: 'Momentum sell', description: '', tier: 'tactical', side: 'SELL', horizon: 'intraday', cadence: '15m' },
});

test('new strategy from scratch clarifies the example and applies all rules and risk before an explicit save', async ({ page }) => {
  test.setTimeout(60000);
  let written: unknown;
  await page.route('**/api/session', route => route.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', route => route.fulfill({ json: [] }));
  await page.route('**/api/strategies/*', route => {
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route);
    if (route.request().method() !== 'PUT') return route.fulfill({ json: [] });
    const request = route.request().postDataJSON(); written = request.draft;
    return route.fulfill({ json: { ...request.draft, _id: route.request().url().split('/').at(-1), revision: 1, savedAt: new Date().toISOString() } });
  });
  await page.route('**/api/backtests**', route => route.fulfill({ json: route.request().url().includes('/universe') ? { stocks: [], listCount: 0 } : [] }));
  await page.route('**/api/ai/status', route => route.fulfill({ json: { configured: true, provider: 'Gemini', model: 'fixture' } }));
  let calls = 0;
  await page.route('**/api/ai/proposals', route => {
    const body = route.request().postDataJSON(); calls++;
    expect(body.focus).toBeUndefined(); expect(body.currentDraft.name).toBe('');
    expect(body.currentDraft.entry.groups[0].conditions).toHaveLength(0);
    if (calls === 1) {
      expect(body.prompt).toBe(mondayPrompt);
      return route.fulfill({ json: { text: 'One measurement needs your choice.', assumptions: [], questions: [turnoverQuestion], blockers: [], example: null, proposal: null } });
    }
    expect(body.messages.at(-1).text).toContain(turnoverQuestion.question);
    expect(body.prompt).toContain('monthly average');
    return route.fulfill({ json: { text: 'Review the agreed strategy with average daily turnover.', assumptions: [], questions: [], blockers: [], example: null, proposal } });
  });
  await page.goto('/strategies');
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByLabel('Message the strategy assistant', { exact: true }).fill(mondayPrompt);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply to builder', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: turnoverQuestion.options[0], exact: true }).check();
  await page.getByRole('button', { name: 'Proceed' }).click();
  await expect(page.getByRole('button', { name: 'Apply to builder', exact: true })).toBeEnabled();
  expect(written).toBeUndefined();
  await page.getByRole('button', { name: 'Apply to builder', exact: true }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue('Monday Momentum Paper Test');
  const steps = page.getByRole('navigation', { name: 'Strategy editor steps' });
  await steps.getByRole('button', { name: '2 Buy rules' }).click();
  await expect(page.locator('.condition-row-summary, .condition-row-edit')).toHaveCount(7);
  await steps.getByRole('button', { name: '3 Sell rules' }).click();
  await expect(page.locator('.condition-row-summary, .condition-row-edit')).toHaveCount(1);
  await steps.getByRole('button', { name: '4 Risk' }).click();
  await expect(page.getByLabel('Risk per trade (%)', { exact: true })).toHaveValue('0.5');
  await steps.getByRole('button', { name: '5 Review & save' }).click();
  expect(written).toBeUndefined();
  await page.getByRole('button', { name: 'Create strategy', exact: true }).click();
  await expect.poll(() => written).toEqual(proposal);
});
