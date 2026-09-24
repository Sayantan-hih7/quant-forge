import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { signInAdmin } from './helpers/auth';
import type { QualificationWorkspace } from '../src/modules/qualification/types';

async function workspace(page: Page): Promise<QualificationWorkspace> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('quantforge-qualification')!).state.workspaces['admin@example.com']);
}
async function selectIndex(page: Page, name: string) {
  const input = page.getByRole('combobox', { name: 'Filter candidates by index' });
  await input.click();
  await input.fill(name);
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: new RegExp(`^${name} \\(`) }).click();
  await input.press('Escape');
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-17T06:00:00Z') });
  await signInAdmin(page, 'Qualification');
});

test('every membership is visible; index filters combine without duplicate stocks and export all tags', async ({ page }) => {
  const before = await workspace(page);
  const row = page.locator('.q-candidate-table tbody tr.ant-table-row').filter({ has: page.getByRole('button', { name: 'RELIANCE Reliance Industries', exact: true }) });
  await expect(row.locator('.q-index-tags .ant-tag')).toHaveText(['NIFTY 50', 'NIFTY 100', 'NIFTY 200', 'NIFTY 500']);
  await row.getByRole('button').click();
  await expect(page.getByRole('dialog')).toContainText('Conditions used by the published scan');
  await expect(page.getByRole('dialog').locator('.q-rule-summary')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText('Your custom selection');
  await expect(page.getByRole('dialog').locator('.q-index-tags .ant-tag')).toHaveText(['NIFTY 50', 'NIFTY 100', 'NIFTY 200', 'NIFTY 500']);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  await selectIndex(page, 'NIFTY 50');
  await expect(page.locator('.q-index-filter-note')).toContainText('50 of 62 candidates');
  await selectIndex(page, 'NIFTY 200');
  await expect(page.locator('.q-index-filter-note')).toContainText('62 of 62 candidates');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export list' }).click();
  const download = await downloadEvent;
  const csv = await readFile((await download.path())!, 'utf8');
  const lines = csv.trim().split('\r\n');
  expect(lines).toHaveLength(63);
  expect(new Set(lines.slice(1).map((line) => line.split(',')[0])).size).toBe(62);
  expect(lines[0]).toContain('"Indices"');
  expect(lines[1]).toContain('"NIFTY 50 | NIFTY 100 | NIFTY 200 | NIFTY 500"');

  await page.getByRole('combobox', { name: 'Filter candidates by sector' }).click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^Technology$/ }).click();
  await page.getByRole('textbox', { name: 'Search qualified stocks' }).fill('INFY');
  await expect(page.locator('.q-index-filter-note')).toContainText('1 of 62 candidates');
  await expect(page.locator('.q-candidate-table tbody tr.ant-table-row')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search qualified stocks' }).fill('RELIANCE');
  await expect(page.locator('.q-candidate-table')).toContainText('No candidates match your search.');
  expect((await workspace(page)).caches).toEqual(before.caches);
  expect((await workspace(page)).jobs).toEqual([]);
});

test('tags and index filters fit light, dark and mobile layouts', async ({ page }) => {
  await selectIndex(page, 'NIFTY NEXT 50');
  await expect(page.locator('.q-index-filter-note')).toContainText('12 of 62 candidates');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.q-index-tags').first()).toHaveCSS('display', 'flex');
    await expect(page.locator('.q-index-tags').first()).toHaveCSS('flex-wrap', 'wrap');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/screenshots/stock-indices-${theme}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.q-index-tags').first().locator('.ant-tag')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/stock-indices-mobile.png', fullPage: true, animations: 'disabled' });
  await page.locator('.q-index-filter .ant-select-clear').click();
  await expect(page.locator('.q-index-filter-note')).toContainText('62 of 62 candidates');
});

test('index metadata migration enriches old caches and trial results without changing saved memberships', async ({ page }) => {
  await page.getByRole('tab', { name: 'Monthly rules' }).click();
  await page.locator('.monthly-condition').nth(0).getByLabel('Value (₹ Cr)', { exact: true }).fill('3001');
  await page.getByRole('button', { name: 'Save and run', exact: true }).click();
  await expect(page.locator('.q-scan-job')).toContainText('Queued');
  await page.clock.fastForward(31000);
  const before = await workspace(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('quantforge-qualification')!);
    saved.version = 2;
    const state = saved.state.workspaces['admin@example.com'];
    for (const cache of [...Object.values(state.caches), state.jobs[0].result] as { candidates: { indices?: string[] }[] }[]) {
      cache.candidates.forEach((stock, index) => { if (index === 0) stock.indices = ['nifty-200']; else delete stock.indices; });
    }
    localStorage.setItem('quantforge-qualification', JSON.stringify(saved));
  });
  await signInAdmin(page, 'Qualification');
  const after = await workspace(page);
  expect(after.templates).toEqual(before.templates);
  expect(after.runs).toEqual(before.runs);
  const expected = structuredClone(before);
  expected.caches['2026-09'].candidates[0].indices = ['nifty-200'];
  expected.jobs[0].result!.candidates[0].indices = ['nifty-200'];
  expect(after.caches).toEqual(expected.caches);
  expect(after.jobs).toEqual(expected.jobs);
  await page.getByRole('tab', { name: 'Monthly rules' }).click();
  await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.q-index-tags').first().locator('.ant-tag')).toHaveText(['NIFTY 200']);
});
