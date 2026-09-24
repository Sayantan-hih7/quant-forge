import { test, expect } from '@playwright/test';
import { initialTemplates } from '../src/modules/qualification/config/templates';
import { createQualificationWorkspace } from '../src/modules/qualification/api/mockQualification';
import { normalizeStrategyPairs, savedStrategyPairs } from '../src/modules/strategies/utils/strategyPairs';
import { monitorDefinitions } from '../src/modules/signals/utils/monitoring';
import { signInAdmin } from './helpers/auth';

test('fresh strategies all have paired buy/sell rules; custom migrations require review and preserve data', () => {
  const fresh = createQualificationWorkspace('2026-09');
  expect(fresh.runs).toEqual([]);
  expect(savedStrategyPairs(fresh)).toHaveLength(3);
  expect(monitorDefinitions(fresh).every(pair => pair.entry.side === 'BUY' && pair.exit?.side === 'SELL')).toBe(true);
  const custom = structuredClone(initialTemplates.find(rule => rule.id === 'tactical-intraday')!);
  custom.id = 'my-custom'; custom.name = 'My conditions'; custom.groups[1].conditions[0].value = 3.5;
  const old = { ...fresh, tradingPlans: undefined, templates: [...structuredClone(initialTemplates), custom] };
  const upgraded = normalizeStrategyPairs(old);
  expect(upgraded.caches).toEqual(old.caches);
  expect(upgraded.monthlyRule).toEqual(old.monthlyRule);
  expect(upgraded.templates.find(rule => rule.id === custom.id)?.groups).toEqual(custom.groups);
  expect(upgraded.tradingPlans?.find(plan => plan.entryRuleId === custom.id)?.needsReview).toBe(true);
  expect(monitorDefinitions(upgraded)).toHaveLength(3);
  expect(normalizeStrategyPairs(upgraded)).toEqual(upgraded);
});

test('stored custom conditions migrate into one strategy builder and can be completed', async ({ page }) => {
  const legacy = createQualificationWorkspace('2026-09');
  legacy.tradingPlans = undefined;
  legacy.templates = structuredClone(initialTemplates);
  legacy.templates.find(rule => rule.id === 'tactical-intraday')!.groups[1].conditions[0].value = 3.5;
  await page.addInitScript(workspace => {
    if (!localStorage.getItem('fixture-installed')) {
      localStorage.setItem('quantforge-qualification', JSON.stringify({ version: 4, state: { workspaces: { 'admin@example.com': workspace } } }));
      localStorage.setItem('fixture-installed', 'yes');
    }
  }, legacy);
  await signInAdmin(page);
  await page.getByRole('link', { name: 'Algo Strategies', exact: true }).click();
  await expect(page.getByText(/Complete this strategy: your saved conditions are preserved/)).toBeVisible();
  await expect(page.getByLabel('Threshold (ratio)', { exact: true })).toHaveValue('3.5');
  await expect(page.getByRole('button', { name: 'Backtest strategy', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: /Sell rules/ }).click();
  await page.getByLabel('Threshold (RSI)', { exact: true }).fill('42');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Backtest strategy', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Signal Runner', exact: true }).click();
  await expect(page.locator('.monitor-strategy-select')).toContainText('Intraday Momentum · Buy + Sell');
  await expect(page.getByText('No paired sell rule saved', { exact: true })).toHaveCount(0);
});
