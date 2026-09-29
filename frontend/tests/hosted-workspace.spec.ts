import { expect, test } from '@playwright/test';

test('hosted owner signs in, survives reload, signs out and is required to sign in after expiry', async ({ page }) => {
  let signedIn = false, expired = false, localBootstrap = 0;
  await page.route('**/api/session', route => {
    if (route.request().method() === 'POST') localBootstrap++;
    return route.fulfill({ json: { mode: 'owner', authenticated: signedIn } });
  });
  await page.route('**/api/session/login', route => {
    const body = route.request().postDataJSON();
    if (body.password !== 'Fixture password 123') return route.fulfill({ status: 401, json: { message: 'Email or password is incorrect' } });
    signedIn = true; expired = false; return route.fulfill({ json: { authenticated: true } });
  });
  await page.route('**/api/session/logout', route => { signedIn = false; return route.fulfill({ status: 204 }); });
  await page.route('**/api/market-indices*', route => route.fulfill(expired ? { status: 401, json: { code: 'LOGIN_REQUIRED', message: 'Sign in to your paper workspace' } } : { json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
  await page.goto('/market-data/indices');
  await expect(page.getByRole('heading', { name: 'QuantForge' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Wrong password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('Fixture password 123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Indices', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Indices', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByText('Sign out', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Fixture password 123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Indices', exact: true })).toBeVisible();
  expired = true; await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(localBootstrap).toBe(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Fixture password');
});
