import { test, expect, type Page } from '@playwright/test';
import { defaultDashboardPreferences, dashboardPreferencesSchema, type SavedDashboardPreferences } from '../src/modules/dashboard/config/preferences';
import { defaultDashboardPreferences as backendDefaults, dashboardPreferencesSchema as backendSchema } from '../../backend/src/modules/dashboard/validations/preferences.validation';
import type { WorkspaceDashboard } from '../src/modules/dashboard/types/workspace';

async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: new RegExp(`^${option}$`) }).click();
}
async function fixture(page: Page) {
  let saved: SavedDashboardPreferences = { revision: 0, updatedAt: null, settings: structuredClone(defaultDashboardPreferences) };
  let writes = 0, indexRequests = 0;
  const lists = [{ _id: 'research', name: 'Research', ids: ['NSE:1'], updatedAt: '', createdAt: '' }, { _id: 'swing', name: 'Swing ideas', ids: ['NSE:1', 'NSE:2'], updatedAt: '', createdAt: '' }];
  await page.route('**/api/dashboard/preferences', async route => {
    if (route.request().method() === 'PUT') {
      writes++;
      const body = route.request().postDataJSON();
      if (body.revision !== saved.revision) return route.fulfill({ status: 409, json: { message: 'Dashboard settings changed in another window. Reload the saved settings before saving your changes.' } });
      saved = { revision: saved.revision + 1, settings: body.settings, updatedAt: '2026-09-29T09:00:00Z' };
    }
    return route.fulfill({ json: saved });
  });
  await page.route('**/api/watchlists', route => route.fulfill({ json: { lists, universeCount: 8000 } }));
  await page.route('**/api/market-indices', route => { indexRequests++; return route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000, market: { open: false, reason: 'Market closed', date: '2026-09-29', knownYear: true, closesAt: '2026-09-29T10:00:00Z', nextOpenAt: '2099-01-01T03:45:00Z' } } }); });
  await page.route('**/api/dashboard', route => {
    const preferences = saved.settings;
    const data: WorkspaceDashboard = {
      preferences, at: '2026-09-29T09:00:00Z', month: '2026-09', market: { open: false, reason: 'Market closed', date: '2026-09-29', knownYear: true, closesAt: '2026-09-29T10:00:00Z', nextOpenAt: '2026-09-30T03:45:00Z' },
      stockCount: 8000, strategyCount: 3, signalsToday: 2, qualification: { count: 62, manualCount: 0, publishedAt: null, latestScan: null },
      paper: { accounts: 1, openPositions: 0, realizedPaise: 10000, unrealizedPaise: 0, totalPaise: 10000, staleMarks: 0, missingMarks: 0, pendingOrders: 0, confirmations: 2, workerRunning: false, feed: 'disconnected',
        sessions: Array.from({ length: 11 }, (_, i) => ({ id: `session-${i}`, name: `Strategy ${i}`, revision: 1, currentRevision: 1, mode: 'automatic', paused: false, stocks: 62, checkedAt: null, message: null })) },
      signals: Array.from({ length: 30 }, (_, i) => ({ id: `signal-${i}`, sessionId: 'session', symbol: `STOCK${i}`, side: i % 2 ? 'BUY' : 'SELL', at: '2026-09-29T08:00:00Z', strategy: 'Trend', status: 'filled' })).filter(s => preferences.signalSide === 'all' || s.side === preferences.signalSide).slice(0, preferences.signalCount),
      backtests: Array.from({ length: preferences.backtestCount }, (_, i) => ({ id: `report-${i}`, strategyId: 'strategy', name: `Backtest ${i}`, revision: 1, currentRevision: 1, from: '2025-09-29', to: '2026-09-29', status: 'completed' })),
      watchlists: (preferences.watchlistMode === 'recent' ? lists : preferences.watchlistIds.flatMap(id => lists.filter(l => l._id === id))).map(l => ({ id: l._id, name: l.name, count: l.ids.length })),
    };
    return route.fulfill({ json: data });
  });
  return { saved: () => saved, writes: () => writes, indexRequests: () => indexRequests, conflict: () => { saved = { ...saved, revision: saved.revision + 1, settings: { ...saved.settings, indexIds: ['nse:nifty-200'] } }; } };
}

test('frontend and backend agree on dashboard defaults and supported options', () => {
  expect(defaultDashboardPreferences).toEqual(backendDefaults);
  expect(dashboardPreferencesSchema.parse(backendDefaults)).toEqual(backendDefaults);
  expect(backendSchema.parse(defaultDashboardPreferences)).toEqual(defaultDashboardPreferences);
});

test('choose NIFTY 100, customize sections/cards/watchlists, persist and restore the layout', async ({ page }) => {
  test.setTimeout(90000);
  const state = await fixture(page), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin/dashboard');
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await expect(page).toHaveURL(/settings\?tab=dashboard/);
  await expect(page.getByRole('button', { name: 'Save dashboard', exact: true })).toBeDisabled();
  const indices = page.getByRole('combobox', { name: 'Dashboard indices', exact: true });
  await indices.fill('nifty100');
  await page.locator('.ant-select-item-option').filter({ has: page.getByText('NIFTY 100', { exact: true }) }).click();
  await page.keyboard.press('Escape');
  for (let i = 0; i < 4; i++) await page.getByLabel('Move NIFTY 100 up', { exact: true }).click();
  await page.getByLabel('Move Market overview up', { exact: true }).click();
  await page.getByRole('switch', { name: 'Show Recent backtests', exact: true }).click();
  await page.getByRole('switch', { name: 'Show mini price charts', exact: true }).click();
  for (const name of ['Qualified stocks', 'Strategies monitoring', 'Open paper positions']) await page.getByRole('list', { name: 'Summary card order' }).getByLabel(`Remove ${name}`, { exact: true }).click();
  await select(page, 'Spacing', 'Compact');
  await select(page, 'Signal events', 'Sell only');
  await select(page, 'Recent signals to show', '10 rows');
  await select(page, 'Dashboard watchlists', 'Choose and pin watchlists');
  await select(page, 'Pinned watchlists', 'Swing ideas');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /View dashboard/ })).toBeDisabled();
  await page.screenshot({ path: '../.tools/artifacts/dashboard-settings-custom.png', fullPage: true });
  await page.getByRole('button', { name: 'Save dashboard', exact: true }).click();
  await expect.poll(() => state.saved().revision).toBe(1);
  expect(state.saved().settings.indexIds[0]).toBe('nse:nifty-100');
  await page.getByRole('button', { name: /View dashboard/ }).click();
  await expect(page.locator('[data-dashboard-section]').first()).toHaveAttribute('data-dashboard-section', 'market');
  await expect(page.locator('.index-highlight').first()).toHaveAttribute('aria-label', 'View NIFTY 100 details');
  await expect(page.locator('.index-highlight')).toHaveCount(5);
  await expect(page.locator('.index-sparkline')).toHaveCount(0);
  await expect(page.locator('.workspace-metric')).toHaveCount(1);
  await expect(page.locator('[data-dashboard-section="backtests"]')).toHaveCount(0);
  await expect(page.locator('.workspace-activity > a')).toHaveCount(10);
  await expect(page.locator('.workspace-watchlist-links > a')).toHaveCount(1);
  await expect(page.locator('.workspace-watchlist-links')).toContainText('Swing ideas');
  await expect(page.getByText('The paper worker is offline')).toBeVisible();
  await expect(page.getByText('2 paper orders await your confirmation')).toBeVisible();
  await expect(page.locator('.workspace-dashboard')).toHaveClass(/is-compact/);
  await page.reload();
  await expect(page.locator('.index-highlight').first()).toHaveAttribute('aria-label', 'View NIFTY 100 details');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../.tools/artifacts/dashboard-configured-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  expect(state.saved().revision).toBe(1);
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Selected index order' }).locator('li').first()).toContainText('NIFTY 100');
  await page.getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'Save dashboard', exact: true }).click();
  await expect.poll(() => state.saved().revision).toBe(2);
  expect(state.saved().settings).toEqual(defaultDashboardPreferences);
  await page.getByRole('button', { name: /View dashboard/ }).click();
  await expect(page.locator('.index-highlight')).toHaveCount(4);
  await expect(page.locator('[data-dashboard-section="backtests"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('validate empty choices and avoid index polling when the market widget is hidden', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/settings?tab=dashboard');
  const order = page.getByRole('list', { name: 'Selected index order' });
  for (const name of ['NIFTY 50', 'NIFTY BANK', 'BSE SENSEX', 'BSE BANKEX']) await order.getByLabel(`Remove ${name}`, { exact: true }).click();
  await page.getByRole('button', { name: 'Save dashboard', exact: true }).click();
  await expect(page.getByText('Choose at least one index', { exact: true })).toBeVisible();
  expect(state.writes()).toBe(0);
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByRole('switch', { name: 'Show Market overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save dashboard', exact: true }).click();
  await expect.poll(() => state.saved().revision).toBe(1);
  await page.getByRole('button', { name: /View dashboard/ }).click();
  await expect(page.getByRole('heading', { name: 'Strategy monitoring', exact: true })).toBeVisible();
  await expect(page.locator('[data-dashboard-section="market"]')).toHaveCount(0);
  expect(state.indexRequests()).toBe(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  expect(state.indexRequests()).toBe(0);
  await expect(page.locator('.workspace-panel tbody tr.ant-table-row')).toHaveCount(5);
});

test('a stale editor retains its draft and asks to reload before overwriting newer preferences', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/settings?tab=dashboard');
  await select(page, 'Spacing', 'Compact');
  state.conflict();
  await page.getByRole('button', { name: 'Save dashboard', exact: true }).click();
  await expect(page.getByText('Preferences were not saved')).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  expect(state.saved().settings.density).toBe('comfortable');
  await page.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Selected index order' })).toContainText('NIFTY 200');
  await expect(page.getByRole('button', { name: 'Save dashboard', exact: true })).toBeDisabled();
});
