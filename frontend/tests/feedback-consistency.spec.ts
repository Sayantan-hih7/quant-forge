import { test, expect } from '@playwright/test';
test.setTimeout(60000);

test('poll failures do not shift signal tables; execution blockers remain available after toast closes', async ({ page }, info) => {
  let fail = false;
  await page.route('**/api/session', r => r.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', r => r.fulfill({ json: [] }));
  await page.route('**/api/paper', r => fail ? r.fulfill({ status: 503, json: { message: 'Temporary test outage' } }) : r.fulfill({ json: {
    sessions: [], positions: [], orders: [], signals: [], workerRunning: true, marketOpen: true,
    feed: { state: 'live', freshIds: [], message: '', workerRunning: true },
    safety: { clock: { state: 'verified', message: '' }, warnings: ['Six streams have delayed quotes.', 'Clock verification needs review.'], notices: ['Paper execution hours apply.'] },
  } }));
  await page.goto('/signal-runner', { waitUntil: 'domcontentloaded' });
  const stocks = page.getByText('Watching stocks', { exact: true });
  await expect(stocks).toBeVisible();
  await expect(page.locator('.execution-status')).toContainText('2 issues');
  const before = await stocks.boundingBox();
  await page.getByRole('button', { name: 'View execution status details' }).click();
  await expect(page.getByText('Six streams have delayed quotes.', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Signal runner' }).click();
  fail = true;
  await expect(page.locator('.execution-status')).toContainText('Execution status unavailable', { timeout: 12000 });
  await expect(page.locator('.ant-notification-notice')).toContainText('Temporary test outage');
  const after = await stocks.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('signal-status-desktop.png') });
  await expect(page.locator('.ant-notification-notice')).toHaveCount(0, { timeout: 12000 });
  await page.waitForTimeout(3000);
  await expect(page.locator('.ant-notification-notice')).toHaveCount(0);
  await expect(page.locator('.execution-status')).toContainText('unavailable');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'View execution status details' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('signal-status-mobile.png') });
});

test('strategy dialogs share a centered, bounded shell with keyboard dismissal', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('**/api/session', r => r.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', r => r.fulfill({ json: [] }));
  await page.route('**/api/strategies/examples', r => r.fulfill({ json: [] }));
  await page.goto('/strategies', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.ant-modal-centered')).toBeVisible();
  const styles = await dialog.locator('.ant-modal-body').evaluate(el => ({ overflow: getComputedStyle(el).overflowY, maxHeight: getComputedStyle(el).maxHeight }));
  expect(styles.overflow).toBe('auto');
  expect(styles.maxHeight).not.toBe('none');
  await page.screenshot({ path: info.outputPath('strategy-dialog-dark.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('initial connection failure retains a stable retry state instead of a blank page', async ({ page }) => {
  await page.route('**/api/session', r => r.fulfill({ json: { mode: 'local', authenticated: true } }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/market-data/status', async r => {
    await gate;
    return r.fulfill({ status: 503, json: { message: 'Temporary connection failure' } });
  });
  await page.goto('/data-sources', { waitUntil: 'domcontentloaded' });
  const placeholder = page.locator('.resource-placeholder');
  await expect(placeholder).toHaveAttribute('aria-busy', 'true');
  const before = await placeholder.boundingBox();
  release();
  await expect(placeholder.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  const after = await placeholder.boundingBox();
  expect(Math.abs(before!.height - after!.height)).toBeLessThan(2);
  await expect(page.locator('.ant-notification-notice')).toContainText('Temporary connection failure');
  await expect(page.getByText('Cannot reach the data service', { exact: true })).toHaveCount(0);
});
