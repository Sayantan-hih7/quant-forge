import { respondToStrategyReview } from './helpers/strategyReview';
import { test, expect } from '@playwright/test';
import { monthlyRuleSchema } from '../src/modules/qualification/schemas/monthlyRuleSchema';
import { initialMonthlyRule, newMonthlyCondition } from '../src/modules/qualification/config/monthlyFields';
import { monthlyRulesEqual } from '../src/modules/qualification/utils/monthlyRuleChanges';
import { monthlyConditionSummary } from '../src/modules/qualification/utils/monthlySummary';
import { summarizeCondition } from '../src/modules/qualification/utils/ruleSummary';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import { tradingPlanSchema } from '../src/modules/strategies/schemas/tradingPlanSchema';
import { conditionPresets, presetForCondition } from '../src/modules/qualification/config/conditionPresets';
import { conditionInsight } from '../src/modules/qualification/config/metrics';

test('all presets validate and custom offsets or timeframes remain visible', () => {
  for (const preset of conditionPresets) {
    const draft = sampleTradingPlan('swing');
    draft.entry.groups = [{logic:'AND',conditions:[preset.defaults('tactical')]}];
    const parsed = tradingPlanSchema.safeParse(draft);
    expect(parsed.success, `${preset.id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    expect(presetForCondition(draft.entry.groups[0].conditions[0])).not.toBe('custom');
  }
  const cross = conditionPresets.find(p=>p.id==='emaBullishCross')!.defaults('tactical');
  expect(presetForCondition({...cross,leftOffset:2})).toBe('custom');
  expect(presetForCondition({...cross,leftFrame:'1w',rightFrame:'1d'})).toBe('custom');
  expect(presetForCondition({...cross,multiplier:2})).toBe('custom');
  const atr=conditionPresets.find(p=>p.id==='atrExpansion')!.defaults('tactical');
  expect(presetForCondition({...atr,rightPeriod:21})).toBe('custom');
  expect(conditionInsight({...cross,lookback:3}).summary).toContain('last 3 completed candles');
  expect(conditionInsight({...cross,left:'doji',operator:'eq',rightType:'value',value:0})).toMatchObject({kind:'pattern',detail:expect.stringContaining('not detected')});
});

test('preset can become custom without losing operands and a replacement clears hidden parameters', async ({page}) => {
  test.setTimeout(60000);
  const draft=sampleTradingPlan('swing'), id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  draft.entry.groups=[{logic:'AND',conditions:[conditionPresets.find(p=>p.id==='emaBullishCross')!.defaults('tactical')]}];
  await page.route('**/api/session',r=>r.fulfill({json:{authenticated:true,mode:'local'}}));
  await page.route('**/api/strategies',r=>r.fulfill({json:[{...draft,_id:id,revision:1,savedAt:new Date().toISOString()}]}));
  await page.goto(`/strategies?rule=${id}`);
  await page.getByRole('button',{name:'2 Buy rules',exact:true}).click();
  await page.getByRole('button',{name:'Edit condition 1',exact:true}).click();
  const preset=page.getByRole('combobox',{name:'Condition 1 preset'});
  await expect(page.getByLabel('Fast EMA period',{exact:true})).toHaveValue('5');
  await preset.fill('Custom');await page.getByText('Custom condition',{exact:true}).last().click();
  await expect(page.locator('input[id="entry.groups.0.conditions.0.leftPeriod"]')).toHaveValue('5');
  await page.locator('input[id="entry.groups.0.conditions.0.leftOffset"]').fill('2');
  await preset.fill('RSI bullish');await page.getByText('RSI bullish momentum',{exact:true}).last().click();
  await expect(page.getByLabel('RSI period',{exact:true})).toHaveValue('14');
  await page.getByRole('button',{name:'Set condition',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit condition 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit condition 1',exact:true}).click();
  await preset.fill('Custom');await page.getByText('Custom condition',{exact:true}).last().click();
  await expect(page.locator('input[id="entry.groups.0.conditions.0.leftOffset"]')).toHaveValue('0');
});

test('monthly parameter edits survive parsing and change the executable rule identity', () => {
  const rule = { ...initialMonthlyRule, groups: [{ logic: 'AND' as const, conditions: [{ ...newMonthlyCondition('bodyAboveEma'), period: 21, offset: 1, value: 70 }] }] };
  expect(monthlyRuleSchema.parse(rule).groups[0].conditions[0].period).toBe(21);
  expect(monthlyConditionSummary(rule.groups[0].conditions[0])).toContain('21 candles');
  const changed = structuredClone(rule); changed.groups[0].conditions[0].period = 50;
  expect(monthlyRulesEqual(rule, changed)).toBe(false);
  changed.groups[0].conditions[0].period = 21; changed.groups[0].conditions[0].offset = 2;
  expect(monthlyRulesEqual(rule, changed)).toBe(false);
  changed.groups[0].conditions[0].period = 501;
  expect(monthlyRuleSchema.safeParse(changed).success).toBe(false);
});

test('AI parameterized rules apply, can be manually adjusted, and save with both operands intact', async ({ page }) => {
  test.setTimeout(60000);
  const draft = sampleTradingPlan('swing'); draft.name = 'Prior high breakout';
  draft.entry.groups = [{ logic: 'AND', conditions: [{ left: 'close', leftFrame: '1d', operator: 'gt', rightType: 'indicator',
    right: 'highestHigh', rightFrame: '1d', rightPeriod: 20, rightOffset: 1, value: 0, multiplier: 1, tolerance: 2 }] }];
  const proposal = tradingPlanSchema.parse(draft);
  expect(summarizeCondition(proposal.entry.groups[0].conditions[0])).toContain('20 candles');
  let written: typeof proposal | undefined;
  await page.route('**/api/session', route => route.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', route => route.fulfill({ json: [] }));
  await page.route('**/api/strategies/*', route => {
    if (route.request().url().endsWith('/strategies/review')) return respondToStrategyReview(route);
    if (route.request().method() !== 'PUT') return route.fulfill({ json: [] });
    written = route.request().postDataJSON().draft;
    return route.fulfill({ json: { ...written, _id: 'fixture', revision: 1, savedAt: new Date().toISOString() } });
  });
  await page.route('**/api/backtests**', route => route.fulfill({ json: { stocks: [], listCount: 0 } }));
  await page.route('**/api/ai/status', route => route.fulfill({ json: { configured: true, provider: 'Gemini' } }));
  await page.route('**/api/ai/proposals', route => route.fulfill({ json: { text: 'Compare close with the preceding 20-candle high.', proposal, questions: [], blockers: [], assumptions: [] } }));
  await page.goto('/strategies');
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByLabel('Message the strategy assistant', { exact: true }).fill('Create a swing breakout above the previous 20 daily candle high. Suggest a paper exit and risk setup.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('region', { name: 'AI suggestion preview' })).toContainText('20 candles');
  await expect(page.getByRole('region', { name: 'AI suggestion preview' })).toContainText('1 completed candle earlier');
  expect(written).toBeUndefined();
  await page.getByRole('button', { name: 'Apply to builder', exact: true }).click();
  const steps = page.getByRole('navigation', { name: 'Strategy editor steps' });
  await steps.getByRole('button', { name: '2 Buy rules' }).click();
  await page.getByRole('button', { name: 'Edit condition 1', exact: true }).click();
  await expect(page.getByLabel('Period (candles)', { exact: true })).toHaveValue('20');
  await page.getByLabel('Period (candles)', { exact: true }).fill('30');
  await expect(page.locator('input[id="entry.groups.0.conditions.0.rightOffset"]')).toHaveValue('1');
  await page.screenshot({ path: 'test-results/rule-parameters.png', fullPage: true });
  await steps.getByRole('button', { name: '5 Review & save' }).click();
  await expect(page.getByRole('region', { name: 'Buy rules' })).toContainText('30 candles');
  await page.getByRole('button', { name: 'Create strategy', exact: true }).click();
  await expect.poll(() => written?.entry.groups[0].conditions[0].rightPeriod).toBe(30);
  expect(written!.entry.groups[0].conditions[0].rightOffset).toBe(1);
  expect(written!.exit).toEqual(proposal.exit);
});

test('monthly builder exposes only monthly measurements and saves EMA body parameters', async ({ page }) => {
  test.setTimeout(60000);
  const rule = { ...initialMonthlyRule, groups: [{ logic: 'AND' as const, conditions: [{ ...newMonthlyCondition('bodyAboveEma'), period: 21, offset: 0, value: 70 }] }] };
  let saved: typeof rule | undefined;
  await page.route('**/api/session', route => route.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', rule: { rule, revision: 1 }, canRun: false, runs: [], universe: null } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: [] }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { monthlyFields: ['bodyAboveEma', 'ema'], technical: ['bodyAboveEma', 'ema'], snapshotFields: [], choices: {} } }));
  await page.route('**/api/qualification/rule', route => { saved = route.request().postDataJSON().rule; return route.fulfill({ json: { revision: 1 } }); });
  await page.goto('/qualification?tab=rules');
  await expect(page.getByLabel('EMA period', { exact: true })).toHaveValue('21');
  await page.getByLabel('EMA period', { exact: true }).fill('34');
  await page.getByLabel('Months earlier', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Preview rule', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('34 candles');
  await expect(page.getByRole('dialog')).toContainText('1 completed candle earlier');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({ path: 'test-results/monthly-parameters.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByLabel('EMA period', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect.poll(() => saved?.groups[0].conditions[0].period).toBe(34);
  expect(saved?.groups[0].conditions[0].offset).toBe(1);
});
