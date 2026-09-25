import { expect, test } from '@playwright/test';

test('a failed workspace login shows the backend explanation rather than a raw 403', async ({ page }) => {
  await page.route('**/api/market-indices', route => route.fulfill({ status: 401, json: { code: 'WORKSPACE_SESSION', message: 'Connect to the local workspace' } }));
  await page.route('**/api/session', route => route.fulfill({ status: 403, json: { code: 'SESSION_FORBIDDEN', message: 'This address cannot open a local workspace session. Open the app using its configured local address.' } }));
  await page.goto('/market-data/indices');
  await expect(page.getByText('This address cannot open a local workspace session. Open the app using its configured local address.', { exact: true })).toBeVisible();
  await expect(page.getByText('Request failed with status code 403', { exact: true })).toHaveCount(0);
});

test('an expired workspace session is recreated and its original data request is retried', async ({ page }) => {
  let dataRequests = 0, sessionRequests = 0;
  await page.route('**/api/market-indices', route => {
    dataRequests++;
    return route.fulfill(dataRequests === 1
      ? { status: 401, json: { code: 'WORKSPACE_SESSION', message: 'Connect to the local workspace' } }
      : { json: { quotes: [], sources: [], refreshAfterMs: 60000 } });
  });
  await page.route('**/api/session', route => {
    sessionRequests++;
    return route.fulfill({ json: { mode: 'paper', authenticated: true } });
  });
  await page.goto('/market-data/indices');
  await expect.poll(() => dataRequests).toBe(2);
  expect(sessionRequests).toBe(1);
  await expect(page.getByText('Connect to the local workspace', { exact: true })).toHaveCount(0);
});
