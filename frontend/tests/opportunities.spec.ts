import { test, expect } from '@playwright/test';
import { signInAdmin } from './helpers/auth';
test.beforeEach(async ({ page }) => { await page.clock.install({ time: new Date('2026-09-22T06:00:00Z') }); });

test('dashboard shows only monitor alerts and review opens the matching strategy', async ({ page }) => {
  await signInAdmin(page);
  await expect(page.locator('.stock-opportunities tbody tr.ant-table-row')).toHaveCount(0);
  await expect(page.getByText('Start monitoring a strategy to see its alerts here.')).toBeVisible();
  await page.locator('.stock-opportunities').getByRole('button', { name: 'Open signal runner' }).click();
  await page.getByRole('button', { name: 'Start monitoring', exact: true }).click();
  await page.clock.fastForward(4000);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const panel = page.locator('.stock-opportunities');
  await panel.getByRole('button', { name: 'Select watchlist Intraday Momentum' }).click();
  await expect(panel.locator('tbody tr.ant-table-row')).toHaveCount(8);
  await panel.getByRole('textbox', { name: 'Search stock opportunities' }).fill('INFY');
  await expect(panel.locator('tbody tr.ant-table-row')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Review INFY alert' }).click();
  await expect(page).toHaveURL(/signal-runner/);
  await expect(page.locator('.monitor-strategy-select')).toContainText('Intraday Momentum · Buy + Sell');
});

test('edited rules invalidate existing opportunities until monitor updates and a new candle closes', async ({ page }) => {
  await signInAdmin(page);
  await page.getByRole('link', { name: 'Signal Runner', exact: true }).click();
  await page.getByRole('button', { name: 'Start monitoring', exact: true }).click();
  await page.clock.fastForward(4000);
  await page.getByRole('button', { name: 'Edit trading rules' }).click();
  await page.getByLabel('Threshold (ratio)', { exact: true }).fill('2.1');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.stock-opportunities tbody tr.ant-table-row')).toHaveCount(0);
  await page.getByRole('link', { name: 'Signal Runner', exact: true }).click();
  await page.getByRole('button', { name: 'Update monitor', exact: true }).click();
  await page.clock.fastForward(4000);
  await page.getByRole('button', { name: 'Advance demo candle' }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.stock-opportunities tbody tr.ant-table-row')).toHaveCount(8);
});

test('legacy signal batches do not populate the current dashboard', async ({ page }) => {
  await signInAdmin(page);
  await expect(page.locator('.stock-opportunities')).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('quantforge-qualification')!);
    const workspace = data.state.workspaces['admin@example.com'];
    const cache = workspace.caches['2026-09'];
    workspace.runs = [{ id: 'old', cacheId: cache.id, month: cache.month, templateId: 'tactical-intraday', revision: 1, strategy: 'Old demo', horizon: 'intraday', time: new Date().toISOString(), signals: [{ symbol: 'INFY', name: 'Old fake alert', side: 'BUY', price: 100, entry: 100, stopLoss: 98, target: 104, index: 1 }] }];
    localStorage.setItem('quantforge-qualification', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('.stock-opportunities tbody tr.ant-table-row')).toHaveCount(0);
  await expect(page.locator('.dashboard')).not.toContainText('Old fake alert');
  await expect(page.getByRole('link', { name: 'Signals', exact: true })).toHaveCount(0);
  await page.goto('/signals');
  await expect(page).toHaveURL(/signal-runner/);
});