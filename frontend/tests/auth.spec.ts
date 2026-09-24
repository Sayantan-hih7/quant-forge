import { expect, test } from '@playwright/test';
import { completeOAuthOnboarding, signInAdmin, signInClient } from './helpers/auth';

test('protected routes require login and admin MFA cannot be skipped', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByText('Expert / Admin', { exact: true }).click();
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123');
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page).toHaveURL(/\/auth\/verify$/);
  await page.getByLabel('Authenticator code').fill('111111');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByText('That code did not match. Try the demo code below.')).toBeVisible();
  await page.getByLabel('Authenticator code').fill('654321');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

for (const role of ['admin', 'client'] as const) {
  test(`${role} session expiry still requires login after refresh`, async ({ page }) => {
    if (role === 'admin') await signInAdmin(page);
    else {
      await signInClient(page);
      await expect(page).toHaveURL(/\/onboarding\/broker$/);
    }
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('quantforge-demo-auth')!);
      data.state.session.expiresAt = Date.now() - 1000;
      localStorage.setItem('quantforge-demo-auth', JSON.stringify(data));
    });
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('signup verifies mobile and client credentials connect only after validation', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Asha Shah');
  await page.getByLabel('Email address', { exact: true }).fill('asha@example.com');
  await page.getByLabel('Password', { exact: true }).fill('SamplePass123');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: /^Create account/ }).click();
  await page.getByLabel('Mobile verification code').fill('111111');
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await expect(page.getByText('That code did not match. Try the demo code below.')).toBeVisible();
  await page.getByLabel('Mobile verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/broker$/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to risk setup' })).toBeDisabled();
  await page.getByRole('button', { name: 'Use sample credentials' }).click();
  await expect(page.getByLabel('API secret', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('API key', { exact: true }).fill('demo-invalid');
  await page.getByRole('button', { name: /Test connection/ }).click();
  await expect(page.getByText('Demo connection failed')).toBeVisible();
  await page.getByLabel('API key', { exact: true }).fill('demo-valid-key');
  await page.getByRole('button', { name: /Test connection/ }).click();
  await expect(page.getByText('Demo connection verified')).toBeVisible();
  await page.getByLabel('API secret', { exact: true }).fill('changed-secret');
  await page.getByLabel('Daily authorization / TOTP secret').fill('JBSWY3DPEHPK3PXP');
  await expect(page.getByRole('button', { name: 'Continue to risk setup' })).toBeDisabled();
  await page.getByRole('button', { name: /Test connection/ }).click();
  await expect(page.getByText('Demo connection verified')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to risk setup' }).click();
  await page.getByLabel('Maximum daily stop loss (₹)').fill('150000');
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByText('Daily stop loss must be less than allocated capital')).toBeVisible();
  await page.getByLabel('Maximum daily stop loss (₹)').fill('2500');
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Asha' })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(storage).not.toContain('SamplePass123');
  expect(storage).not.toContain('demo-valid-key');
  expect(storage).not.toContain('changed-secret');
  expect(storage).not.toContain('JBSWY3DPEHPK3PXP');
  await page.reload();
  await expect(page).toHaveURL(/\/client\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Asha' })).toBeVisible();
});

test('social OAuth, client routing, session renewal and broker disconnect', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /Google/ }).click();
  await page.getByRole('button', { name: 'Continue with demo account' }).click();
  await completeOAuthOnboarding(page);
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/client\/dashboard$/);
  await expect(page.getByRole('link', { name: 'Strategy Builder', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('quantforge-demo-auth')!);
    data.state.connections['client@example.com'].expiresAt = Date.now() - 1000;
    localStorage.setItem('quantforge-demo-auth', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByText('Broker session expired · new trades paused')).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Approve demo renewal' }).click();
  await expect(page.getByText('Dhan session connected')).toBeVisible();
  await page.getByRole('link', { name: 'Account settings', exact: true }).click();
  await page.getByRole('button', { name: /Disconnect broker/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect broker', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/broker$/);
  await page.goto('/client/dashboard');
  await expect(page).toHaveURL(/\/onboarding\/broker$/);
});

test('mobile OTP login and broker records are scoped to each account', async ({ page }) => {
  await signInClient(page, 'first@example.com');
  await completeOAuthOnboarding(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByText('Mobile OTP', { exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('second@example.com');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: /Send demo OTP/ }).click();
  await page.getByLabel('Mobile verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/broker$/);
});

test('admin signup requires mobile verification then passkey approval', async ({ page }) => {
  await page.goto('/signup');
  await page.getByText('Expert / Admin', { exact: true }).click();
  await page.getByLabel('Full name').fill('Expert Trader');
  await page.getByLabel('Email address', { exact: true }).fill('expert@example.com');
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: /^Create account/ }).click();
  await page.getByLabel('Mobile verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  await page.getByRole('button', { name: /Use a passkey/ }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/verify$/);
  await page.getByRole('button', { name: /Use a passkey/ }).click();
  await page.getByRole('button', { name: 'Approve demo passkey' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test('auth and onboarding fit mobile and produce review screenshots', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/screenshots/login-light.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/screenshots/login-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /^Sign in/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/login-mobile.png', fullPage: true });
  await signInClient(page);
  await expect(page).toHaveURL(/\/onboarding\/broker$/);
  await expect.poll(() => page.locator('.broker-lettermark img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/onboarding-mobile.png', fullPage: true });
  await completeOAuthOnboarding(page);
  await expect(page.getByRole('heading', { name: 'Welcome, Retail' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/screenshots/client-dashboard.png', fullPage: true });
});
