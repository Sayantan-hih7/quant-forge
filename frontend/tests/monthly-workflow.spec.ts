import { expect, test, type Page } from '@playwright/test';
import { signInAdmin } from './helpers/auth';
import { finishMonthlyScan } from './helpers/scans';
import type { QualificationWorkspace } from '../src/modules/qualification/types';

async function workspace(page: Page): Promise<QualificationWorkspace> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('quantforge-qualification')!).state.workspaces['admin@example.com']);
}
const rules = async (page: Page) => page.getByRole('tab', { name: 'Monthly rules', exact: true }).click();
const condition = (page: Page, index: number) => page.locator('.monthly-condition').nth(index);
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-17T06:00:00Z') });
  await signInAdmin(page, 'Qualification');
});

test('simplified editor previews without scanning and Run depends on saved condition differences', async ({ page }) => {
  const before = await workspace(page);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: /Signal runner/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await rules(page);
  await expect(page.getByRole('button', { name: 'New template', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Activate preset', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Timeframe', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Template name', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Description', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add condition group', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Run scan for' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save and run', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview rule', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('EMA 5 ≥ EMA 21');
  await expect(page.getByRole('dialog')).toContainText('Monthly delivery ≥ 40%');
  await expect(page.getByRole('dialog')).toContainText('This preview does not scan stocks.');
  await page.screenshot({ path: 'test-results/screenshots/monthly-rule-summary.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await workspace(page)).toEqual(before);
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  expect((await workspace(page)).monthlyRule.revision).toBe(before.monthlyRule.revision);
  await condition(page, 2).getByLabel('Value (ratio)', { exact: true }).fill('0.4');
  await page.getByRole('tab', { name: /Qualified stocks/ }).click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await rules(page);
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByRole('tab', { name: /Qualified stocks/ }).click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  expect((await workspace(page)).jobs).toEqual([]);
  expect((await workspace(page)).caches).toEqual(before.caches);
  await signInAdmin(page, 'Qualification');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await rules(page);
  await expect(condition(page, 2).getByLabel('Value (ratio)', { exact: true })).toHaveValue('0.4');
  await condition(page, 2).getByLabel('Value (ratio)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  expect((await workspace(page)).monthlyRule.id).toBe(before.monthlyRule.id);
  expect((await workspace(page)).monthlyRule.revision).toBe(before.monthlyRule.revision + 2);
  await expect(page.getByRole('button', { name: 'Save and run', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: /Qualified stocks/ }).click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
});

test('current-month scans progress, cancel, restart with pinned rules, and replace only after publication', async ({ page }) => {
  const before = await workspace(page);
  await rules(page);
  await condition(page, 2).getByLabel('Value (ratio)', { exact: true }).fill('0.4');
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByRole('tab', { name: /Qualified stocks/ }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.q-scan-job')).toContainText('Queued');
  expect((await workspace(page)).jobs[0]).toMatchObject({ month: '2026-09', dataMonth: '2026-08' });
  await page.clock.fastForward(11000);
  await expect(page.locator('.q-job-progress')).toContainText('/ 6,200 stocks evaluated');
  expect((await workspace(page)).caches).toEqual(before.caches);
  await page.getByRole('button', { name: 'Cancel scan', exact: true }).click();
  await page.clock.fastForward(40000);
  expect((await workspace(page)).jobs[0].status).toBe('cancelled');
  await expect(page.locator('.q-scan-job')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await rules(page);
  await condition(page, 2).getByLabel('Value (ratio)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(page.locator('.q-scan-job')).toContainText('36 candidates found');
  await expect(page.locator('.q-scan-job')).toContainText('rules have changed since this run');
  expect((await workspace(page)).caches).toEqual(before.caches);
  await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Replace the 62-stock list for September 2026?');
  await page.getByRole('button', { name: 'Publish monthly universe' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('tab', { name: /Qualified stocks/ })).toHaveAttribute('aria-selected', 'true');
  const after = await workspace(page);
  expect(after.caches['2026-09'].candidates).toHaveLength(36);
  expect(after.caches['2026-09'].rule.revision).toBe(2);
  expect(after.monthlyRule.revision).toBe(3);
  expect(after.cacheHistory[0]).toEqual(before.caches['2026-09']);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'List version' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Cache month' })).toHaveCount(0);
  await expect(page.locator('.q-index-filter-note')).toContainText('36 of 36 candidates');
  await expect(page.locator('.q-scan-job')).toHaveCount(0);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.stock-opportunities tbody tr.ant-table-row')).toHaveCount(0);
});

test('Save and run targets the current month, and unchanged rules can run after month rollover', async ({ page }) => {
  const before = await workspace(page);
  await rules(page);
  await condition(page, 2).getByLabel('Value (ratio)', { exact: true }).fill('0.4');
  await page.getByRole('button', { name: 'Save and run', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Qualified stocks/ })).toHaveAttribute('aria-selected', 'true');
  expect((await workspace(page)).caches).toEqual(before.caches);
  await finishMonthlyScan(page);
  const after = await workspace(page);
  expect(after.caches['2026-09'].candidates).toHaveLength(36);
  expect(after.caches['2026-09'].dataMonth).toBe('2026-08');
  expect(after.caches['2026-10']).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await page.clock.setSystemTime(new Date('2026-10-02T06:00:00Z'));
  await signInAdmin(page, 'Qualification');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await finishMonthlyScan(page);
  expect((await workspace(page)).caches['2026-09']).toEqual(after.caches['2026-09']);
  expect((await workspace(page)).caches['2026-10'].dataMonth).toBe('2026-09');
});

test('reloading interrupts an unfinished monthly scan without replacing the published stock list', async ({ page }) => {
  const before = await workspace(page);
  await rules(page);
  await condition(page, 2).getByLabel('Value (ratio)', { exact: true }).fill('0.4');
  await page.getByRole('button', { name: 'Save and run', exact: true }).click();
  await page.clock.fastForward(6000);
  await signInAdmin(page, 'Qualification');
  await rules(page);
  await expect(page.locator('.monthly-scan-recovery')).toContainText('Scan interrupted');
  expect((await workspace(page)).caches).toEqual(before.caches);
  await page.getByRole('button', { name: 'Retry scan', exact: true }).click();
  await expect(page.locator('.q-scan-job')).toContainText('Queued');
});

test('category fields offer appropriate operators and validate ranges before saving', async ({ page }) => {
  await rules(page);
  const row = condition(page, 0);
  const choose = async (label: string, option: string) => {
    await row.getByRole('combobox', { name: label, exact: true }).click();
    const dropdown = page.locator('.ant-select-dropdown:visible');
    await dropdown.getByText(option, { exact: true }).click();
    await expect(dropdown).toHaveCount(0);
  };
  await choose('Category', 'Patterns');
  await row.getByRole('combobox', { name: 'Operator', exact: true }).click();
  await expect(page.locator('.ant-select-dropdown:visible')).not.toContainText('Greater than');
  await page.keyboard.press('Escape');
  await choose('Monthly field', 'Monthly candle pattern');
  await choose('Match value', 'Hammer');
  await row.getByLabel('Within last N monthly candles').fill('3');
  await page.getByRole('button', { name: 'Preview rule', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Monthly candle pattern is Hammer within the last 3 completed monthly candles');
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await choose('Category', 'Technical');
  await choose('Monthly field', 'RSI (14)');
  await choose('Operator', 'Between');
  await row.getByLabel('From (points)').fill('70');
  await row.getByLabel('To (points)').fill('50');
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(row.getByText('Upper bound must be at least the lower bound')).toBeVisible();
  await row.getByLabel('From (points)').fill('50');
  await row.getByLabel('To (points)').fill('70');
  const group = page.getByRole('region', { name: 'Monthly conditions', exact: true });
  await group.getByRole('combobox', { name: 'Match conditions', exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('Any · OR', { exact: true }).click();
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  const saved = (await workspace(page)).monthlyRule;
  expect(saved.groups[0].conditions[0]).toMatchObject({ field: 'rsi', operator: 'between', value: 50, upper: 70, timeframe: '1mo' });
  expect(saved.groups).toHaveLength(1);
  expect(saved.groups[0].logic).toBe('OR');
});

test('migration preserves saved lists, memberships and older rules while requiring review of the monthly-only template', async ({ page }) => {
  const before = await workspace(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('quantforge-qualification')!);
    data.version = 3;
    const old = data.state.workspaces['admin@example.com'];
    delete old.monthlyRule;
    delete old.monthlyRuleSaved;
    delete old.cacheHistory;
    localStorage.setItem('quantforge-qualification', JSON.stringify(data));
  });
  await signInAdmin(page, 'Qualification');
  const after = await workspace(page);
  expect(after.caches).toEqual(before.caches);
  expect(after.templates).toEqual(before.templates);
  expect(after.runs).toEqual(before.runs);
  expect(after.monthlyRuleSaved).toBe(false);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
});

test('old trial cards and list selectors stay hidden; a stale month link still shows the current month', async ({ page }) => {
  const before = await workspace(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('quantforge-qualification')!);
    const saved = data.state.workspaces['admin@example.com'];
    saved.caches['2026-08'] = { ...saved.caches['2026-09'], month: '2026-08', candidates: [] };
    saved.cacheHistory = [saved.caches['2026-09']];
    saved.jobs = [{ id: 'old-trial', kind: 'trial', status: 'cancelled', phase: 'done', month: '2026-09', rules: [saved.templates[0]], scopeCount: 6200, createdAt: Date.now(), updatedAt: Date.now(), progress: 0, processed: 0 }];
    localStorage.setItem('quantforge-qualification', JSON.stringify(data));
  });
  await signInAdmin(page, 'Qualification');
  await page.evaluate(() => { history.pushState(null, '', '/qualification?tab=universe&month=2026-08'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.locator('.q-cache-banner')).toContainText('September 2026');
  await expect(page.locator('.q-index-filter-note')).toContainText('62 of 62 candidates');
  await expect(page.getByRole('combobox', { name: 'Cache month' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'List version' })).toHaveCount(0);
  await expect(page.locator('.q-scan-job')).toHaveCount(0);
  await expect(page.getByText('Base preset trial', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry scan', exact: true })).toHaveCount(0);
  expect((await workspace(page)).caches['2026-09']).toEqual(before.caches['2026-09']);
});

test('an empty monthly result is published honestly and prevents trading scans', async ({ page }) => {
  await rules(page);
  await condition(page, 0).getByLabel('Value (₹ Cr)', { exact: true }).fill('99999999');
  await page.getByRole('button', { name: 'Save and run', exact: true }).click();
  await finishMonthlyScan(page);
  expect((await workspace(page)).caches['2026-09'].candidates).toHaveLength(0);
  await expect(page.locator('.q-candidate-table')).toContainText('No stocks passed the saved monthly rule.');
  await page.getByRole('link', { name: 'Signal Runner', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start monitoring' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Check latest candles' })).toBeDisabled();
});
