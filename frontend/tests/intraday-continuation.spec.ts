import { test, expect } from '@playwright/test';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
test('daily plan uses the existing session and retains pause after returning the next time', async ({ page }) => {
  test.setTimeout(60000);
  let paused = false, changed = 0;
  const id = '00000000-0000-4000-8000-000000000001';
  const strategy = { ...sampleTradingPlan('intraday'), _id: id, revision: 7, savedAt: '2026-10-09T03:00:00Z' };
  await page.route('**/api/session', r => r.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', r => r.fulfill({ json: [strategy] }));
  await page.route('**/api/paper', r => r.fulfill({ json: {
    sessions: [{ _id: id, strategy, ids: ['NSE:1'], active: true, mode: 'automatic', entriesPaused: paused, cashPaise: 10003000, initialPaise: 10000000,
      intraday: { date: '2026-10-09', nextOpenAt: '2026-10-12T03:45:00.000Z', calendarKnown: true, continuation: paused ? 'paused' : 'automatic', phase: paused ? 'paused' : 'waiting-session', unfinishedPositions: 0, eligibleStocks: 1 } }],
    positions: [], orders: [], signals: [], workerRunning: true, marketOpen: false,
    feed: { state: 'idle', freshIds: [], message: 'Market closed' },
  } }));
  await page.route('**/api/paper/sessions/' + id, async r => {
    expect(r.request().method()).toBe('PATCH');
    paused = r.request().postDataJSON().entriesPaused; changed++;
    await r.fulfill({ json: { ok: true } });
  });
  await page.goto('/signal-runner', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Review daily plan' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Saved revision 7');
  await expect(drawer).toContainText('12 Oct');
  await expect(drawer).toContainText('Cash and P&L carry forward');
  await drawer.getByRole('button', { name: 'Pause entries until I resume' }).click();
  await expect(drawer.getByRole('button', { name: 'Resume automatic entries' })).toBeVisible();
  expect(changed).toBe(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Review daily plan' }).click();
  await expect(page.getByRole('dialog')).toContainText('Paused until you resume');
  await page.getByRole('button', { name: 'Resume automatic entries' }).click();
  await expect(page.getByRole('button', { name: 'Pause entries until I resume' })).toBeVisible();
  expect(changed).toBe(2);
});
