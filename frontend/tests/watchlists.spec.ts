import { test, expect } from '@playwright/test';
import type { Watchlist } from '../src/modules/watchlists/types';

test('browse the full universe, save either exchange, rename and remove without qualifying stocks', async ({ page }) => {
  const lists: Watchlist[] = [];
  const all = Array.from({ length: 45 }, (_, i) => ({ _id: `${i % 2 ? 'BSE' : 'NSE'}:${i + 1}`, symbol: `STOCK${String(i).padStart(2, '0')}`, name: `Company ${i}`, exchange: i % 2 ? 'BSE' : 'NSE', isin: `TEST${i}`, active: true }));
  const mutations: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.EventSource = class { onmessage = null; onerror = null; close() {} } as unknown as typeof EventSource; });
  await page.route('**/api/stocks/quotes?*', route => route.fulfill({ json: { quotes: [] } }));
  await page.route('**/api/watchlists**', async route => {
    const req = route.request(), url = new URL(req.url()), parts = url.pathname.split('/').slice(3), method = req.method();
    if (method !== 'GET') mutations.push(url.pathname);
    if (parts[0] === 'stocks') {
      const params = url.searchParams, list = lists.find(l => l._id === params.get('listId'));
      let rows = all.filter(s => (!list || list.ids.includes(s._id)) && (!params.get('q') || `${s.symbol} ${s.name}`.toLowerCase().includes(params.get('q')!.toLowerCase())) && (!params.get('exchange') || s.exchange === params.get('exchange')));
      if (params.get('order') === 'desc') rows = rows.reverse();
      const size = Number(params.get('pageSize')), requested = Number(params.get('page')), current = Math.min(requested, Math.max(1, Math.ceil(rows.length / size)));
      return route.fulfill({ json: { items: rows.slice((current - 1) * size, current * size), total: rows.length, page: current, pageSize: size } });
    }
    if (!parts[0] && method === 'GET') return route.fulfill({ json: { lists, universeCount: 45 } });
    if (!parts[0] && method === 'POST') { const list = { _id: 'list-1', name: req.postDataJSON().name, ids: [], createdAt: '', updatedAt: '' }; lists.push(list); return route.fulfill({ json: list }); }
    const list = lists.find(l => l._id === parts[0])!;
    if (parts[1] === 'stocks') {
      if (method === 'POST') list.ids = [...new Set([...list.ids, req.postDataJSON().instrumentId])];
      else list.ids = list.ids.filter(id => id !== decodeURIComponent(parts[2]));
    } else if (method === 'PATCH') list.name = req.postDataJSON().name;
    else if (method === 'DELETE') lists.splice(lists.indexOf(list), 1);
    return route.fulfill({ json: list });
  });
  await page.goto('/market-data/watchlists');
  await expect(page.getByRole('heading', { name: 'Stocks & watchlists' })).toBeVisible();
  await expect(page.locator('tbody tr.ant-table-row')).toHaveCount(20);
  await expect(page.getByText('1–20 of 45 stocks')).toBeVisible();
  await page.getByTitle('Next Page').click();
  await expect(page.getByRole('button', { name: 'STOCK20', exact: true })).toBeVisible();
  await page.getByLabel('Search stock universe').fill('STOCK03');
  await expect(page.locator('tbody tr.ant-table-row')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('BSE');
  await page.getByRole('button', { name: 'Save STOCK03 to watchlist' }).click();
  await page.getByRole('menuitem', { name: 'New watchlist' }).click();
  await page.getByLabel('Watchlist name').fill('Swing ideas');
  await page.getByRole('button', { name: 'Create watchlist', exact: true }).click();
  await expect.poll(() => lists[0]?.ids).toEqual(['BSE:4']);
  await page.getByRole('button', { name: /Swing ideas/ }).click();
  await page.getByLabel('Search stock universe').clear();
  await expect(page.locator('tbody')).toContainText('STOCK03');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Swing ideas', exact: true })).toBeVisible();
  await page.getByLabel('Rename watchlist').click();
  await page.getByLabel('Watchlist name').fill('Research');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('This watchlist is empty')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../.tools/artifacts/watchlists-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Delete list' }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All stocks', exact: true })).toBeVisible();
  expect(mutations.every(path => path.startsWith('/api/watchlists'))).toBe(true);
  expect(errors).toEqual([]);
});
