import { expect, test } from '@playwright/test';
import { signInAdmin } from './helpers/auth';

test('qualification tabs render at desktop and mobile widths in both themes', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signInAdmin(page);
  await page.getByRole('link', { name: 'Qualification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stock qualification', exact: true })).toBeVisible();
  await expect(page.locator('.q-stat-grid')).toHaveCSS('display', 'grid');
  await expect(page.getByRole('tab', { name: /Qualified stocks/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.q-candidate-table tbody tr.ant-table-row')).toHaveCount(10);
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const [tab, name] of [['universe', /Qualified stocks/], ['rules', /Monthly rules/]] as const) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `test-results/screenshots/qualification-${tab}-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  for (const [tab, name] of [['universe', /Qualified stocks/], ['rules', /Monthly rules/]] as const) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/screenshots/qualification-${tab}-mobile.png`, fullPage: true, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});
