import { test, expect } from '@playwright/test';
import { signInAdmin } from './helpers/auth';

test('dashboard loads its layout styles on the running development server', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1100 });
  await signInAdmin(page);
  const grid = page.locator('.opportunities-layout');
  await expect(grid).toHaveCSS('display', 'grid');
  await expect(page.locator('.opportunity-summary')).toHaveCSS('display', 'flex');
  const sidebar = (await page.locator('.opportunity-watchlists').boundingBox())!;
  const main = (await page.locator('.opportunities-main').boundingBox())!;
  expect(sidebar.width).toBeGreaterThanOrEqual(180);
  expect(sidebar.width).toBeLessThan(260);
  expect(main.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width - 1);
  expect(Math.abs(main.y - sidebar.y)).toBeLessThan(2);
  await expect(page.locator('.stock-opportunities tbody tr.ant-table-row')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.stock-opportunities').evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    await page.screenshot({ path: `test-results/screenshots/dashboard-5173-fixed-${mode}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(grid).toHaveCSS('display', 'grid');
  const mobileSidebar = (await page.locator('.opportunity-watchlists').boundingBox())!;
  const mobileMain = (await page.locator('.opportunities-main').boundingBox())!;
  expect(mobileMain.y).toBeGreaterThanOrEqual(mobileSidebar.y + mobileSidebar.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/dashboard-5173-fixed-mobile.png', fullPage: true, animations: 'disabled' });
});


test('the two-tier workspace preserves prior monthly data in its separate storage key', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('legacy-fixture-seeded')) {
      localStorage.setItem('quantforge-strategy-workspaces', JSON.stringify({ state: { workspaces: { 'admin@example.com': { name: 'Earlier custom workspace', bases: [] } } }, version: 3 }));
      localStorage.setItem('legacy-fixture-seeded', 'true');
    }
  });
  await signInAdmin(page);
  const previous = await page.evaluate(() => localStorage.getItem('quantforge-strategy-workspaces'));
  await page.getByRole('button', { name: 'Open signal runner' }).click();
  await expect(page.getByRole('button', { name: 'Start monitoring' })).toBeVisible();
  await page.getByRole('link', { name: 'Qualification', exact: true }).click();
  await expect(page.locator('.q-stat-grid')).toContainText('62');
  await signInAdmin(page);
  expect(await page.evaluate(() => localStorage.getItem('quantforge-strategy-workspaces'))).toBe(previous);
});
