import { expect, test } from '@playwright/test';
import { signInAdmin } from './helpers/auth';

test('dashboard shows the requested indices and filters signals by horizon and search', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signInAdmin(page);
  await expect(page.getByRole('heading', { name: 'Good morning, Manish.' })).toBeVisible();
  await expect(page.locator('.ticker-item')).toHaveCount(3);
  await expect(page.locator('.market-ticker')).not.toContainText('FINNIFTY');
  await expect(page.locator('.market-ticker')).not.toContainText('INDIA VIX');
  await expect(page.getByRole('heading', { name: /Live Quantitative Strategies/ })).toHaveCount(0);
  const opportunities = page.locator('.stock-opportunities');
  await expect(opportunities.locator('tbody tr.ant-table-row')).toHaveCount(0);
  await opportunities.getByText('Swing', { exact: true }).click();
  await expect(opportunities.locator('tbody tr.ant-table-row')).toHaveCount(0);
  for (const row of await opportunities.locator('tbody tr.ant-table-row').all()) await expect(row).toContainText('Swing Breakouts');
  await opportunities.getByText('All horizons', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Search stock opportunities' }).fill('no-match');
  await expect(page.getByText('No ready buy alerts. Start monitoring in Signal Runner, or adjust these filters.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('theme and sidebar preferences persist and system mode follows the OS', async ({ page }) => {
  await signInAdmin(page, 'Settings');
  await page.locator('.ant-radio-button-wrapper').filter({ hasText: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await signInAdmin(page, 'Settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await page.locator('.ant-radio-button-wrapper').filter({ hasText: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.ant-radio-button-wrapper').filter({ hasText: 'System' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('dashboard opens the separate qualification builder and algo runner; removed kill switch stays hidden', async ({ page }) => {
  await signInAdmin(page);
  await expect(page.getByRole('button', { name: 'KILL SWITCH' })).toHaveCount(0);
  await page.getByRole('button', { name: /Signal runner/ }).first().click();
  await expect(page).toHaveURL(/\/signal-runner$/);
  await expect(page.getByRole('heading', { name: 'Signal runner', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start monitoring' })).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Rule builder', exact: false }).click();
  await expect(page).toHaveURL(/\/qualification\?tab=rules$/);
  await expect(page.getByRole('tab', { name: 'Monthly rules', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('mobile menu navigates to qualification without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAdmin(page);
  await expect(page.getByRole('heading', { name: 'Good morning, Manish.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Qualification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stock qualification', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
