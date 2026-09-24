import { expect, type Page } from '@playwright/test';

export async function signInAdmin(page: Page, destination?: 'Settings' | 'Qualification') {
  // Start a fresh login without clearing the user's saved UI workspace.
  // Completed demo sessions now persist across reloads.
  if (page.url().startsWith('http')) await page.evaluate(() => {
    const stored = localStorage.getItem('quantforge-demo-auth');
    if (stored) {
      const auth = JSON.parse(stored);
      auth.state.session = null;
      localStorage.setItem('quantforge-demo-auth', JSON.stringify(auth));
    }
  });
  await page.goto('/login');
  await page.getByText('Expert / Admin', { exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123');
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await page.getByLabel('Authenticator code').fill('654321');
  await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  if (destination) await page.getByRole('link', { name: destination, exact: true }).click();
}

export async function signInClient(page: Page, email = 'client@example.com') {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123');
  await page.getByRole('button', { name: /^Sign in/ }).click();
}

export async function completeOAuthOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/onboarding\/broker$/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Continue with Dhan/ }).click();
  await page.getByRole('button', { name: 'Approve demo connection' }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/client\/dashboard$/);
}
