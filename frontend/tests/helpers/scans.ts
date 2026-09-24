import { expect, type Page } from '@playwright/test';

export async function queueScan(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Queue scan', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.q-scan-job').first()).toContainText('Queued');
}
export async function finishSignalScan(page: Page) {
  await queueScan(page);
  await page.clock.fastForward(13000);
  await expect(page.locator('.q-scan-job').first()).toContainText('Completed');
}
export async function finishMonthlyScan(page: Page) {
  await expect(page.locator('.q-scan-job').first()).toContainText('Queued');
  await page.clock.fastForward(31000);
  await expect(page.getByRole('button', { name: 'Review & publish', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish monthly universe' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
