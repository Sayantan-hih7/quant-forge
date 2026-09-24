import { expect, test } from '@playwright/test';

const code = '12345678-1234-1234-1234-123456789012';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/market-data/status', route => route.fulfill({ json: {
    listings: 0, companies: 0, recentRuns: [], coverage: [], candles: [], indices: [], limitations: [],
    dhan: { connected: false, apiConfigured: true, hasSavedToken: false },
  } }));
  await page.route('**/api/market-feed', route => route.fulfill({ json: { state: 'disconnected', configured: false, workerRunning: false, quotes: [] } }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
});

test('Dhan paste form accepts an old redirect URL and shows a verified connection after exchange', async ({ page }) => {
  const redirect = `https://previous-app.example/callback?tokenId=${code}`;
  await page.route('**/api/connections/dhan/token', async route => {
    expect(route.request().postDataJSON()).toEqual({ token: redirect });
    await page.route('**/api/market-data/status', r => r.fulfill({ json: {
      listings: 0, companies: 0, recentRuns: [], coverage: [], candles: [], indices: [], limitations: [],
      dhan: { connected: true, apiConfigured: true, hasSavedToken: true, dataPlan: 'Active', expiresAt: '2099-09-24T10:05:00Z' },
    } }));
    await route.fulfill({ json: { connected: true, dataPlan: 'Active', expiresAt: '2099-09-24T10:05:00Z' } });
  });
  await page.goto('/data-sources');
  await page.getByRole('button', { name: 'Paste token or login code' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Login codes are exchanged automatically/)).toBeVisible();
  const input = dialog.getByLabel('Access token, login code or redirect URL', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill(redirect);
  await dialog.getByRole('button', { name: 'Verify and connect' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Data plan: Active', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Paste token or login code' }).click();
  await expect(page.getByLabel('Access token, login code or redirect URL', { exact: true })).toHaveValue('');
});

test('expired login codes show a persistent useful error and can be corrected without closing the form', async ({ page }) => {
  await page.route('**/api/connections/dhan/token', route => route.fulfill({ status: 424, json: {
    code: 'DHAN_CONSENT_REJECTED', message: 'Dhan rejected this login code. Start a new Dhan login and paste its latest redirect URL or tokenId.',
  } }));
  await page.goto('/data-sources');
  await page.getByRole('button', { name: 'Paste token or login code' }).click();
  await page.getByLabel('Access token, login code or redirect URL', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify and connect' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Dhan connection failed')).toBeVisible();
  await expect(dialog.getByText(/Start a new Dhan login/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Verify and connect' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByLabel('Access token, login code or redirect URL', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
