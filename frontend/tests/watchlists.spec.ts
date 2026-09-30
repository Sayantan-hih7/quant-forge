import { test, expect, type Page } from '@playwright/test';
import { initialMonthlyRule } from '../src/modules/qualification/config/monthlyFields';
import { discoveryGroups } from '../../backend/src/modules/stock-discovery/config/groups';

async function fixture(page: Page) {
  const all = Array.from({ length: 45 }, (_, i) => ({ _id: `${i % 2 ? 'BSE' : 'NSE'}:${i + 1}`, symbol: `STOCK${String(i).padStart(2, '0')}`, name: `Company ${i}`, exchange: i % 2 ? 'BSE' : 'NSE', isin: `TEST${i}`, active: true }));
  all[1].isin = all[0].isin; // Both exchange listings of one qualified company.
  const list = { _id: 'personal', name: 'Watchlist', ids: [] as string[], createdAt: '', updatedAt: '0' };
  const members = [{ instrumentId: all[0]._id, isin: all[0].isin, source: 'scan', addedAt: '2026-09-01', note: '' }];
  let published = true, revision = 1;
  const mutations: string[] = [], errors: string[] = [], discoveryRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const run = { _id: 'scan-1', month: '2026-09', status: 'completed', cutoff: '2026-09-29T06:00:00Z', total: 4, processed: 4, qualified: 1, rejected: 1, unavailable: 1, awaitingHistory: 1, fingerprint: 'fixture', revision: 1 };
  const results = [
    { _id: 'passed', instrumentId: all[0]._id, instrument: all[0], status: 'qualified', checks: [{ field: 'marketCap', matched: true, left: 3000, right: 2000 }] },
    { _id: 'rejected', instrumentId: all[2]._id, instrument: all[2], status: 'rejected', checks: [{ field: 'marketCap', matched: false, reason: 'Market cap 1500 is below the required 2000 Cr', left: 1500, right: 2000 }] },
    { _id: 'unavailable', instrumentId: all[3]._id, instrument: all[3], status: 'unavailable', checks: [{ field: 'promoterPledge', matched: null, reason: 'No verified promoter pledge report' }] },
    { _id: 'waiting', instrumentId: all[4]._id, instrument: all[4], status: 'awaiting_history', checks: [{ field: 'ema21', matched: null, reason: 'Only 8 of 21 completed months available' }] },
  ];
  await page.addInitScript(() => { window.EventSource = class { onmessage = null; onerror = null; close() {} } as unknown as typeof EventSource; });
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method(), params = url.searchParams;
    if (method !== 'GET') mutations.push(path);
    if (path === '/api/session') return route.fulfill({ json: { mode: 'local', authenticated: true } });
    if (path === '/api/watchlists') return route.fulfill({ json: { lists: [list], universeCount: all.length } });
    if (path === '/api/stock-discovery') {
      discoveryRequests.push(req.url());
      const total = all.filter(s => !params.get('exchange') || s.exchange === params.get('exchange')).length;
      return route.fulfill({ json: { groups: discoveryGroups.map(group => ({ ...group, coverage: { total, available: total, missing: 0, matched: total } })), refreshing: false, market: { open: false, reason: 'Market closed', nextOpenAt: null }, sessionDate: '2026-09-29', captureStartedAt: '2026-09-29T09:59:00Z', capturedAt: '2026-09-29T10:00:00Z', factsCheckedAt: '2026-09-29T10:00:00Z', stale: false, version: 'snapshot-1', warning: null } });
    }
    if (path === '/api/stock-discovery/stocks') {
      let rows = all.filter(s => (!params.get('exchange') || s.exchange === params.get('exchange'))).toReversed().map((s, i) => ({ ...s, discovery: { rank: i + 1, checks: [
        { field: 'percent', label: 'Session change', value: 45 - i, unit: '%', source: 'dhan-snapshot', period: '2026-09-29', observedAt: '2026-09-29T10:00:00Z' },
        { field: 'marketCap', label: 'Market cap', value: 20000 + i, unit: '₹ Cr', source: 'dhan-company', observedAt: '2026-09-28T10:00:00Z' },
      ] } }));
      if (params.get('q')) rows = rows.filter(s => `${s.symbol} ${s.name}`.toLowerCase().includes(params.get('q')!.toLowerCase()));
      if (params.get('sort') === 'symbol') rows.sort((a, b) => a.symbol.localeCompare(b.symbol) * (params.get('order') === 'desc' ? -1 : 1));
      const size = Number(params.get('pageSize')), current = Math.min(Number(params.get('page')), Math.max(1, Math.ceil(rows.length / size)));
      return route.fulfill({ json: { items: rows.slice((current - 1) * size, current * size), total: rows.length, page: current, pageSize: size } });
    }
    if (path === '/api/watchlists/stocks') {
      let rows = all.filter(stock => (!params.get('listId') || list.ids.includes(stock._id)) && (!params.get('q') || `${stock.symbol} ${stock.name}`.toLowerCase().includes(params.get('q')!.toLowerCase())) && (!params.get('exchange') || stock.exchange === params.get('exchange')));
      if (params.get('order') === 'desc') rows = rows.reverse();
      const size = Number(params.get('pageSize')), current = Math.min(Number(params.get('page')), Math.max(1, Math.ceil(rows.length / size)));
      return route.fulfill({ json: { items: rows.slice((current - 1) * size, current * size), total: rows.length, page: current, pageSize: size } });
    }
    if (path.startsWith('/api/watchlists/personal/stocks')) {
      if (method === 'POST') list.ids = [...new Set([...list.ids, req.postDataJSON().instrumentId])];
      else list.ids = list.ids.filter(id => id !== decodeURIComponent(path.split('/').at(-1)!));
      list.updatedAt = String(Number(list.updatedAt) + 1);
      return route.fulfill({ json: list });
    }
    if (path === '/api/qualification/membership') return route.fulfill({ json: { month: '2026-09', revision, published, members } });
    if (path === '/api/qualification') return route.fulfill({ json: { month: '2026-09', canRun: false, rule: { rule: initialMonthlyRule, fingerprint: 'fixture', revision: 1 }, universe: published ? { runId: run._id, members, fingerprint: 'fixture' } : null, runs: [run], latestCompletedRun: run } });
    if (path === '/api/qualification/universe') return route.fulfill({ json: members.map(member => ({ ...member, instrument: all.find(stock => stock._id === member.instrumentId), metrics: {} })) });
    if (path.includes('/results')) {
      const rows = results.filter(row => (!params.get('status') || row.status === params.get('status')) && (params.get('outsideUniverse') !== 'true' || row.status !== 'qualified' && !members.some(member => member.isin === row.instrument.isin)) && (!params.get('q') || row.instrument.symbol.toLowerCase().includes(params.get('q')!.toLowerCase())));
      return route.fulfill({ json: { rows, total: rows.length, page: 1 } });
    }
    if (path === '/api/qualification/manual' && method === 'POST') {
      const body = req.postDataJSON(), stock = all.find(stock => stock._id === body.instrumentId)!;
      members.push({ instrumentId: stock._id, isin: stock.isin, source: 'manual', addedAt: '2026-09-29', note: body.note }); revision++;
      return route.fulfill({ status: 204 });
    }
    if (path.startsWith('/api/qualification/manual') && method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').at(-1)!);
      const i = members.findIndex(member => member.instrumentId === id && member.source === 'manual');
      if (i >= 0) members.splice(i, 1); revision++;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/market-data/capabilities') return route.fulfill({ json: { monthlyFields: [], technical: [], snapshotFields: [], choices: { sector: [], index: [] } } });
    if (path === '/api/market-data/instruments') return route.fulfill({ json: all.filter(stock => stock.symbol.toLowerCase().includes(params.get('q')!.toLowerCase())) });
    if (path === '/api/stocks/quotes') return route.fulfill({ json: { quotes: [] } });
    if (path.endsWith('/chart')) return route.fulfill({ json: { bars: [], source: 'Test', timeframe: '1d' } });
    if (path.endsWith('/listings')) { const instrument = all.find(stock => decodeURIComponent(path).includes(stock._id)) ?? all[0]; return route.fulfill({ json: { instrument, listings: all.filter(stock => stock.isin === instrument.isin) } }); }
    if (path.endsWith('/related')) { const instrument = all.find(stock => decodeURIComponent(path).includes(stock._id)) ?? all[0]; return route.fulfill({ json: { sector: 'Banking', ordering: 'similar-market-cap', items: all.filter(stock => stock.exchange === instrument.exchange && stock.isin !== instrument.isin).slice(0, 3).map(stock => ({ ...stock, marketCap: 2000, marketCapObservedAt: '2026-09-29T10:00:00Z' })) } }); }
    if (path.startsWith('/api/stocks/')) return route.fulfill({ json: { instrument: all.find(stock => path.includes(encodeURIComponent(stock._id))) ?? all[0], facts: [], qualification: null } });
    return route.fulfill({ json: {} });
  });
  return { list, members, mutations, errors, discoveryRequests, setPublished: (value: boolean) => { published = value; } };
}

test('one-click watchlist persists, handles both exchanges, and manual qualification requires a reason', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const state = await fixture(page);
  await page.goto('/market-data/watchlists');
  await expect(page.getByRole('heading', { name: 'Stocks & watchlist' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New watchlist' })).toHaveCount(0);
  await expect(page.locator('tbody tr.ant-table-row')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'STOCK00 already qualified' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'STOCK01 already qualified' })).toBeDisabled();
  await page.getByTitle('Next Page').click();
  await expect(page.getByRole('button', { name: 'STOCK20', exact: true })).toBeVisible();
  await page.getByLabel('Search stock universe').fill('STOCK03');
  await expect(page.locator('tbody tr.ant-table-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add STOCK03 to watchlist', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove STOCK03 from watchlist' })).toHaveAttribute('aria-pressed', 'true');
  expect(state.members).toHaveLength(1);
  expect(state.mutations).toEqual(['/api/watchlists/personal/stocks']);
  await page.getByRole('tab', { name: 'Watchlist (1)', exact: true }).click();
  await expect(page).toHaveURL(/tab=watchlist/);
  await page.reload();
  await expect(page.locator('tbody')).toContainText('STOCK03');
  await page.getByRole('button', { name: 'Add STOCK03 to qualification', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('monthly rules not verified');
  await page.getByRole('button', { name: 'Add to qualified stocks', exact: true }).click();
  await expect(page.getByText('Explain why you are adding this stock', { exact: true })).toBeVisible();
  await page.getByLabel('Your reason for adding').fill('Independent research; monitoring improving liquidity');
  await page.getByRole('button', { name: 'Add to qualified stocks', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'STOCK03 already qualified' })).toBeDisabled();
  await expect(page.locator('tbody')).toContainText('Manually added');
  await page.screenshot({ path: testInfo.outputPath('watchlist-simple-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('watchlist-simple-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Remove STOCK03 from watchlist' }).click();
  await expect(page.getByText('Star a stock to start your watchlist')).toBeVisible();
  expect(state.members).toHaveLength(2); // Removing a star never removes qualification.
  expect(state.mutations.every(path => path.startsWith('/api/watchlists/') || path === '/api/qualification/manual')).toBe(true);
  expect(state.errors).toEqual([]);
});

test('recently viewed companies persist, deduplicate exchanges and open related stocks without changing watchlists', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  const state = await fixture(page);
  await page.goto('/market-data/watchlists');
  const recent = page.getByRole('region', { name: 'Recently viewed stocks', exact: true });
  await expect(recent).toHaveCount(0);
  await page.getByRole('button', { name: 'STOCK00', exact: true }).click();
  const drawer = page.locator('.stock-detail-drawer');
  await drawer.locator('.stock-exchange-switch label').filter({ hasText: 'BSE' }).click();
  await expect(drawer.locator('.stock-drawer-title')).toContainText('STOCK01');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(recent.getByRole('button', { name: /^Reopen / })).toHaveCount(1);
  await recent.getByRole('button', { name: 'Reopen STOCK01 on BSE' }).click();
  await expect(drawer.locator('.stock-drawer-title')).toContainText('STOCK01');
  const related = drawer.getByRole('region', { name: 'Related stocks', exact: true });
  await expect(related).toContainText('Same sector · Banking');
  await related.getByRole('button', { name: 'View related stock STOCK03 on BSE' }).click();
  await expect(drawer.locator('.stock-drawer-title')).toContainText('STOCK03');
  await expect(drawer.getByRole('button', { name: 'Previous stock', exact: true })).toBeDisabled();
  await drawer.getByRole('button', { name: 'Back to STOCK01', exact: true }).click();
  await expect(drawer.locator('.stock-drawer-title')).toContainText('STOCK01');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  for (const symbol of ['STOCK02', 'STOCK04', 'STOCK06', 'STOCK08']) {
    await page.getByRole('button', { name: symbol, exact: true }).click();
    await expect(drawer.locator('.stock-exchange-note')).not.toContainText('Checking');
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  }
  await expect(recent.getByRole('button', { name: /^Reopen / })).toHaveCount(4);
  await recent.getByRole('button', { name: 'Show all (6)', exact: true }).click();
  await expect(recent.getByRole('button', { name: /^Reopen / })).toHaveCount(6);
  await page.reload();
  await expect(recent.getByRole('button', { name: /^Reopen / }).first()).toHaveAccessibleName('Reopen STOCK08 on NSE');
  await page.screenshot({ path: testInfo.outputPath('recent-stocks-desktop.png'), fullPage: true });
  await recent.getByRole('button', { name: 'Reopen STOCK08 on NSE' }).click();
  await drawer.getByRole('region', { name: 'Related stocks', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('related-stocks-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await drawer.locator('.ant-drawer-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('related-stocks-mobile.png') });
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await recent.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recent-stocks-mobile.png') });
  await recent.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(recent).toHaveCount(0);
  await page.reload(); await expect(recent).toHaveCount(0);
  expect(state.list.ids).toHaveLength(0);
  expect(state.mutations).toEqual([]); expect(state.errors).toEqual([]);
});

test('discovery explains its rules, ranks across pages, supports BSE, and keeps watchlist and qualification actions', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const state = await fixture(page);
  await page.goto('/market-data/watchlists');
  await expect(page.getByRole('heading', { name: 'Discover stocks' })).toBeVisible();
  await page.getByRole('button', { name: /^Top gainers/ }).click();
  await expect(page).toHaveURL(/group=gainers/);
  await expect(page.locator('tbody tr.ant-table-row').first()).toContainText('STOCK44');
  await expect(page.getByText('Market closed · automatic updates paused')).toBeVisible();
  await page.getByRole('button', { name: 'View rules', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Every condition below must match (AND)');
  await expect(drawer).toContainText('≥ ₹20');
  await expect(drawer).toContainText('session volume × session average price');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTitle('Next Page').click();
  await expect(page.locator('tbody tr.ant-table-row').first()).toContainText('STOCK24');
  await expect(page.locator('tbody tr.ant-table-row').first()).toContainText('#21');
  await page.getByLabel('Search stock universe').fill('STOCK03');
  await expect(page.locator('tbody tr.ant-table-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Why STOCK03 is included' }).click();
  await expect(page.locator('.ant-popover:visible')).toContainText('Dhan market snapshot');
  await expect(page.locator('.ant-popover:visible')).toContainText('Session change');
  await page.getByRole('heading', { name: 'Discover stocks' }).click();
  await page.getByRole('button', { name: 'Add STOCK03 to watchlist', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove STOCK03 from watchlist' })).toBeVisible();
  await page.getByRole('button', { name: 'Add STOCK03 to qualification', exact: true }).click();
  await page.getByLabel('Your reason for adding').fill('Researching this company independently of monthly rules');
  await page.getByRole('button', { name: 'Add to qualified stocks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'STOCK03 already qualified' })).toBeDisabled();
  await page.getByLabel('Search stock universe').clear();
  await page.getByRole('combobox', { name: 'Stock exchange' }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: 'BSE' }).click();
  await expect(page.locator('tbody tr.ant-table-row').first()).toContainText('STOCK43');
  await expect(page.getByText('22 matches', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('discovery-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('discovery-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Show all stocks', exact: true }).click();
  await expect(page).not.toHaveURL(/group=/);
  await page.getByRole('tab', { name: 'Watchlist (1)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discover stocks' })).toHaveCount(0);
  await expect(page.locator('tbody')).toContainText('STOCK03');
  expect(state.mutations).toEqual(['/api/watchlists/personal/stocks', '/api/qualification/manual']);
  expect(state.errors).toEqual([]);
});

test('discovery group bookmarks survive reload and empty group search can return to all stocks', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/market-data/watchlists?group=large');
  await expect(page.getByRole('button', { name: /^Large companies/ })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Large companies/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Search stock universe').fill('nothing');
  await expect(page.getByText('No stocks in this group match your search')).toBeVisible();
  await page.getByLabel('Search stock universe').clear();
  await page.locator('th').filter({ hasText: /^Stock$/ }).click();
  await expect(page.locator('tbody tr.ant-table-row').first()).toContainText('STOCK00');
  await page.getByRole('button', { name: 'Restore group ranking' }).click();
  await expect(page.locator('tbody tr.ant-table-row').first()).toContainText('STOCK44');
  expect(state.errors).toEqual([]);
});

test('non-qualified results explain gaps and support watchlist/manual actions without altering scan decisions', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const state = await fixture(page);
  await page.goto('/qualification?tab=not-qualified');
  await expect(page.getByRole('heading', { name: 'Not qualified in the latest completed scan' })).toBeVisible();
  const table = page.getByRole('tabpanel', { name: 'Not qualified', exact: true }).locator('table');
  await expect(table.locator('tbody tr.ant-table-row')).toHaveCount(3);
  await expect(table).toContainText('Did not match rules');
  await expect(table).toContainText('Missing required data');
  await expect(table).toContainText('Awaiting monthly history');
  await table.getByRole('button', { name: 'Expand row' }).first().click();
  await expect(page.getByText('Market cap 1500 is below the required 2000 Cr')).toBeVisible();
  await table.getByRole('button', { name: 'Add STOCK02 to watchlist', exact: true }).click();
  await expect(table.getByRole('button', { name: 'Remove STOCK02 from watchlist' })).toBeVisible();
  await table.getByRole('button', { name: 'Add STOCK02 to qualification', exact: true }).click();
  await page.getByLabel('Your reason for adding').fill('Own research; monthly market cap filter overridden');
  await page.getByRole('button', { name: 'Add to qualified stocks', exact: true }).click();
  await expect(table.locator('tbody tr.ant-table-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Qualified stocks (2)', exact: true }).click();
  const manual = page.getByRole('tabpanel', { name: /Qualified stocks/ }).locator('tbody tr.ant-table-row').filter({ hasText: 'STOCK02' });
  await expect(manual).toContainText('Manually added');
  await expect(manual.getByRole('button', { name: 'Remove STOCK02 from watchlist' })).toBeVisible();
  const scanned = page.getByRole('tabpanel', { name: /Qualified stocks/ }).locator('tbody tr.ant-table-row').filter({ hasText: 'STOCK00' });
  await expect(scanned.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await manual.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('tab', { name: 'Not qualified', exact: true }).click();
  await expect(table.locator('tbody tr.ant-table-row')).toHaveCount(3);
  await page.getByLabel('Search scan results').fill('STOCK04');
  await expect(table.locator('tbody tr.ant-table-row')).toHaveCount(1);
  await table.getByRole('button', { name: 'Expand row' }).click();
  await expect(page.getByText('Only 8 of 21 completed months available')).toBeVisible();
  await page.getByLabel('Search scan results').clear();
  await page.screenshot({ path: testInfo.outputPath('not-qualified-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Review results', exact: true }).click();
  await expect(page.getByRole('dialog').locator('tbody tr.ant-table-row')).toHaveCount(4);
  await expect(page.getByRole('dialog')).toContainText('original scan decisions');
  expect(state.errors).toEqual([]);
});

test('qualification action explains why it is disabled before first publication', async ({ page }) => {
  test.setTimeout(60000);
  const state = await fixture(page); state.setPublished(false);
  await page.goto('/market-data/watchlists');
  await expect(page.getByRole('button', { name: 'Add STOCK02 to qualification', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add STOCK02 to qualification', exact: true }).locator('..').hover();
  await expect(page.getByRole('tooltip')).toContainText('Publish your monthly qualified list');
  await page.getByRole('button', { name: 'Add STOCK02 to watchlist', exact: true }).click();
  await expect.poll(() => state.list.ids).toEqual(['NSE:3']);
  expect(state.errors).toEqual([]);
});

test('qualified table manual search excludes already-qualified companies and saves research notes', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/qualification?tab=universe');
  await page.getByRole('button', { name: 'Add stock manually', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Stock', exact: true }).fill('STOCK01');
  await expect(page.locator('.ant-select-item-option-disabled')).toContainText('Already qualified');
  await dialog.getByRole('combobox', { name: 'Stock', exact: true }).fill('STOCK08');
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'STOCK08' }).click();
  await dialog.getByLabel('Your reason for adding').fill('Own valuation research, independent of monthly rules');
  await dialog.getByRole('button', { name: 'Add to qualified stocks', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole('tabpanel', { name: /Qualified stocks/ }).locator('tbody tr.ant-table-row').filter({ hasText: 'STOCK08' });
  await expect(row).toContainText('Manually added');
  expect(state.members.find(member => member.instrumentId === 'NSE:9')?.note).toBe('Own valuation research, independent of monthly rules');
  expect(state.errors).toEqual([]);
});
