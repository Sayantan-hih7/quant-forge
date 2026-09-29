import { respondToStrategyReview } from './helpers/strategyReview';
import { test, expect, type Page } from '@playwright/test';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import { tradingPlanSchema } from '../src/modules/strategies/schemas/tradingPlanSchema';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const original = () => ({ ...sampleTradingPlan('swing'), _id: id, revision: 1, savedAt: new Date().toISOString() });
const questions = [
  { id: 'entry_meaning', question: 'Is ₹100 an example or an actual buy limit?', reason: 'A limit controls when a buy can fill.', options: ['Example only, use a 4% stop', 'Actual ₹100 limit and ₹96 stop'] },
  { id: 'allocation', question: 'How many shares should the first target sell?', reason: 'The final target closes what remains.', options: ['50%, then the rest', '30%, then the rest'] },
];
const ready = (risk: ReturnType<typeof original>['risk']) => ({ text: 'Review the 4% stop, partial exits and stop moving to entry.', assumptions: [], questions: [], blockers: [], example: { entry: 100, atr: null },
  proposal: { risk: { ...risk, stopMode: 'fixed', stopPercent: 4, entryOrderType: 'market', exitTargets: [{ basis: 'risk', value: 2, closePercent: 50 }, { basis: 'risk', value: 4, closePercent: 50 }], breakevenAfterTarget1: false, stopManagement: { breakeven: { trigger: 'target', at: 1 } } } }, provider: 'Gemini', model: 'fixture' });
async function fixture(page: Page) {
  let saved = original(), writes = 0;
  await page.route('**/api/session', route => route.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', route => route.fulfill({ json: [saved] }));
  await page.route('**/api/strategies/*', route => {
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route); saved = { ...route.request().postDataJSON().draft, _id: id, revision: ++writes + 1 }; return route.fulfill({ json: saved }); });
  await page.route('**/api/backtests**', route => route.fulfill({ json: route.request().url().includes('/universe') ? { stocks: [], listCount: 0 } : [] }));
  await page.route('**/api/ai/status', route => route.fulfill({ json: { configured: true, provider: 'Gemini', model: 'fixture' } }));
  await page.goto('/strategies?rule=' + id);
  await page.getByRole('navigation', { name: 'Strategy editor steps' }).getByRole('button', { name: '4 Risk' }).click();
  await page.getByRole('button', { name: 'Explain my risk plan', exact: true }).click();
  return { saved: () => saved, writes: () => writes };
}
const send = async (page: Page, prompt: string) => { await page.getByLabel('Message the strategy assistant', { exact: true }).fill(prompt); await page.getByRole('button', { name: 'Send', exact: true }).click(); };

test('scenario questions survive closing and answers produce a risk-only editable plan with a calculated example', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const state = await fixture(page);
  let calls = 0;
  await page.route('**/api/ai/proposals', route => {
    const body = route.request().postDataJSON(); calls++;
    expect(body.focus).toBe('risk'); expect(body.currentDraft.entry).toEqual(original().entry);
    if (calls === 1) return route.fulfill({ json: { text: 'Two decisions are needed.', assumptions: [], proposal: null, questions, blockers: [], example: { entry: 100, atr: null } } });
    expect(body.messages.at(-1).text).toContain(questions[0].question);
    expect(body.prompt).toContain('Example only'); expect(body.prompt).toContain('50%');
    return route.fulfill({ json: ready(body.currentDraft.risk) });
  });
  await send(page, 'I buy at 100 with SL96. Sell some at 2R and the rest at 4R. Move SL to entry after the first sale.');
  await expect(page.getByRole('region', { name: 'Questions to complete your plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to builder', exact: true }).click();
  await page.getByRole('button', { name: 'Explain my risk plan', exact: true }).click();
  await page.getByLabel(questions[0].question, { exact: true }).fill('Example only, use a 4% stop');
  await page.getByLabel(questions[1].question, { exact: true }).fill('50%, then the rest');
  await page.getByRole('button', { name: 'Continue with my answers' }).click();
  const preview = page.getByRole('region', { name: 'AI suggestion preview' });
  await expect(preview.getByText('₹108.00', { exact: true })).toBeVisible();
  await expect(preview.getByText('₹116.00', { exact: true })).toBeVisible();
  await expect(preview).toContainText('Changed');
  expect(state.writes()).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('risk-assistant-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('risk-assistant-mobile.png') });
  await page.getByRole('button', { name: 'Apply risk settings' }).click();
  await expect(page.getByLabel('Stop distance (%)', { exact: true })).toHaveValue(/^4(?:\.0+)?$/);
  await expect(page.getByLabel('Reference entry price (₹)', { exact: true })).toHaveValue('100.00');
  expect(state.writes()).toBe(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(state.writes).toBe(1);
  expect(state.saved().entry).toEqual(tradingPlanSchema.parse(original()).entry); expect(state.saved().exit).toEqual(tradingPlanSchema.parse(original()).exit);
  expect(state.saved().risk.exitTargets).toHaveLength(2);
  expect(state.saved().risk.entryLimitPrice).toBeUndefined();
});

test('a later clarification blocks an older proposal and manual edits require refreshing the suggestion', async ({ page }) => {
  const state = await fixture(page);
  let calls = 0;
  await page.route('**/api/ai/proposals', route => {
    calls++; const body = route.request().postDataJSON();
    return route.fulfill({ json: calls === 2 ? { text: 'When should trailing start?', assumptions: [], questions: [questions[1]], blockers: [], example: null, proposal: null } : ready(body.currentDraft.risk) });
  });
  await send(page, 'Set a 4% stop and 2R / 4R targets with half at each.');
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeEnabled();
  await send(page, 'Also add trailing sometime after a rise.');
  await expect(page.getByText('Previous suggestion shown', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeDisabled();
  await send(page, 'Keep the previous complete plan; do not add trailing.');
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to builder', exact: true }).click();
  await page.getByLabel('Risk per trade (%)', { exact: true }).fill('0.5');
  await page.getByRole('button', { name: 'Explain my risk plan', exact: true }).click();
  await expect(page.getByText('Your manual settings changed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeDisabled();
  const sent = page.waitForRequest(request => request.url().endsWith('/ai/proposals'));
  await send(page, 'Update using my current settings.');
  expect((await sent).postDataJSON().currentDraft.risk.riskPercent).toBe(0.5);
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeEnabled();
  expect(state.writes()).toBe(0);
});

test('unsupported ideas and explanation-only replies do not invent a partial plan', async ({ page }) => {
  const state = await fixture(page);
  await page.route('**/api/ai/proposals', route => route.fulfill({ json: { text: 'This stop type needs additional engine support.', assumptions: [], proposal: null, questions: [],
    blockers: ['Dynamic ATR trailing after a target is unavailable. You can choose a distance in initial risk instead.'], example: null } }));
  await send(page, 'Trail using changing ATR after Target 1.');
  await expect(page.getByText('What is needed to complete this idea', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeDisabled();
  await page.route('**/api/ai/proposals', route => route.fulfill({ json: { text: 'Your initial stop protects you before any profit target. Later adjustments raise the same stop.', assumptions: [], proposal: null, questions: [], blockers: [], example: null } }));
  await page.getByRole('button', { name: 'Explain my current settings', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('before any profit target');
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeDisabled();
  expect(state.writes()).toBe(0);
});

test('explanations preserve a ready suggestion but never resolve unanswered questions', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/ai/proposals', route => {
    const body = route.request().postDataJSON();
    if (body.prompt.startsWith('Explain')) return route.fulfill({ json: { text: 'The stop protects remaining shares; moving it does not sell them.', explanationOnly: true, assumptions: [], questions: [], blockers: [], proposal: null, example: null } });
    if (body.prompt.startsWith('Add')) return route.fulfill({ json: { text: 'Please choose when trailing starts.', assumptions: [], questions: [questions[1]], blockers: [], proposal: null, example: null } });
    return route.fulfill({ json: ready(body.currentDraft.risk) });
  });
  await send(page, 'Set a 4% stop, half at2R and half at4R.');
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeEnabled();
  await send(page, 'Explain this plan before I apply it.');
  await expect(page.getByRole('log')).toContainText('moving it does not sell');
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeEnabled();
  await send(page, 'Add trailing later.');
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeDisabled();
  await send(page, 'Explain the question first.');
  await expect(page.getByRole('region', { name: 'Questions to complete your plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply risk settings' })).toBeDisabled();
});
