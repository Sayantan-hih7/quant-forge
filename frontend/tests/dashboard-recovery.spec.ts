import { test, expect } from '@playwright/test';
import type { WorkspaceDashboard } from '../src/modules/dashboard/types/workspace';
const data: WorkspaceDashboard = {
  at: '2026-09-29T07:00:00Z', month: '2026-09', market: { open: true, reason: 'Market open', date: '2026-09-29', knownYear: true, closesAt: '2026-09-29T10:00:00Z', nextOpenAt: '2026-09-30T03:45:00Z' },
  stockCount: 8000, strategyCount: 3, signalsToday: 2,
  qualification: { count: 62, manualCount: 2, publishedAt: '2026-09-28T05:00:00Z', latestScan: { _id: 'scan', status: 'completed', processed: 5400, total: 5400, qualified: 58, unavailable: 12 } },
  paper: { accounts: 2, openPositions: 1, realizedPaise: 120000, unrealizedPaise: -20000, totalPaise: 100000, missingMarks: 0, staleMarks: 0, pendingOrders: 0, confirmations: 1, workerRunning: true, feed: 'live',
    sessions: [{ id: 'session', name: 'Swing trend', revision: 1, currentRevision: 2, mode: 'automatic', paused: false, stocks: 62, checkedAt: '2026-09-29T06:59:00Z', message: 'Waiting for next candle' }] },
  signals: [{ id: 'signal', sessionId: 'session', symbol: 'INFY', side: 'SELL', at: '2026-09-29T06:55:00Z', strategy: 'Swing trend', status: 'filled' }],
  backtests: [{ id: 'test', strategyId: 'strategy', name: 'Swing trend', revision: 1, currentRevision: 2, status: 'completed', from: '2025-09-28', to: '2026-09-27' }],
  watchlists: [{ id: 'list', name: 'Research', count: 5 }],
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/dashboard', route => route.fulfill({ json: data }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000, market: { ...data.market, open: false, reason: 'Market closed', nextOpenAt: '2099-01-01T03:45:00Z' } } }));
});
test('dashboard shows actual workspace totals, revisions and useful routes without demo runtime', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: /Dashboard/ })).toBeVisible();
  await expect(page.getByLabel('Workspace summary')).toContainText('62');
  await expect(page.getByLabel('Workspace summary')).toContainText('₹1,000.00');
  await expect(page.getByText('Saved r2', { exact: true })).toBeVisible();
  await expect(page.getByText('Older rules · saved r2', { exact: true })).toBeVisible();
  await expect(page.getByText('1 paper orders await your confirmation')).toBeVisible();
  await expect(page.getByText('Live feed needs attention')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Research 5 stocks/ })).toHaveAttribute('href', '/market-data/watchlists?list=list');
  await expect(page.getByText(/UI DEMO|Mock data only|SIMULATED/)).toHaveCount(0);
  await expect(page.locator('.index-highlight')).toHaveCount(4);
  await expect(page.locator('.workspace-metrics')).toHaveCSS('display', 'grid');
  await page.screenshot({ path: '../.tools/artifacts/workspace-dashboard-light.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: '../.tools/artifacts/workspace-dashboard-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../.tools/artifacts/workspace-dashboard-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('missing marks do not become a fabricated total P&L', async ({ page }) => {
  await page.route('**/api/dashboard', route => route.fulfill({ json: { ...data, paper: { ...data.paper, missingMarks: 1, unrealizedPaise: null, totalPaise: null } } }));
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('link', { name: /Total paper P&L/ })).toContainText('Unavailable');
  await expect(page.getByText(/1 positions lack prices/)).toBeVisible();
});
