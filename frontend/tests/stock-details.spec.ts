import { expect, test, type Page } from '@playwright/test';
import { initialMonthlyRule } from '../src/modules/qualification/config/monthlyFields';

const stocks = [
  { instrumentId: 'NSE:1023', isin: 'INE171A01029', source: 'scan', addedAt: '2026-09-23', instrument: { symbol: 'FEDERALBNK', name: 'Federal Bank Limited', exchange: 'NSE' }, metrics: { sector: 'Banking', index: ['nifty-200'], delivery: 48.2 } },
  { instrumentId: 'BSE:500112', isin: 'INE062A01020', source: 'manual', addedAt: '2026-09-23', note: 'My separate long-term research.', instrument: { symbol: 'SBIN', name: 'State Bank of India', exchange: 'BSE' }, metrics: { sector: 'Banking', index: ['bse-sensex'] } },
];
const quote = (id = 'NSE:1023', price = 326.85) => ({ instrumentId: id, price, previousClose: 331.3, change: price - 331.3, percent: (price - 331.3) / 331.3 * 100, open: 328, high: 332.7, low: 325.95, volume: 1932410, averagePrice: 328.5, lowerCircuit: 300, upperCircuit: 360, lastTradeAt: new Date().toISOString(), receivedAt: new Date().toISOString(), source: 'dhan-snapshot' });
async function fixture(page: Page) {
  await page.addInitScript(() => {
    const Native = window.EventSource;
    const feeds: { onmessage: ((event: { data: string }) => void) | null; close: () => void; ids: string[] }[] = [];
    Object.assign(window, { stockTestFeeds: feeds });
    window.EventSource = class {
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror = null;
      ids: string[] = [];
      constructor(url: string, options?: EventSourceInit) {
        if (!String(url).includes('/stocks/stream')) return new Native(url, options);
        this.ids = new URL(url, location.origin).searchParams.get('ids')!.split(','); feeds.push(this);
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ status: { state: 'streaming' } }) }), 100);
      }
      close() { this.onmessage = null; }
    } as unknown as typeof EventSource;
  });
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', rule: { rule: initialMonthlyRule, fingerprint: 'fixture', revision: 1 }, runs: [], universe: { runId: 'published', members: stocks }, canRun: false } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: stocks }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { monthlyFields: [], technical: [], snapshotFields: [], choices: { sector: [{ label: 'Banking', value: 'Banking' }], index: [{ label: 'NIFTY 200', value: 'nifty-200' }] } } }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
  await page.route('**/api/stocks/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/quotes')) return route.fulfill({ json: { quotes: [quote(), { ...quote('BSE:500112', 880), previousClose: null, change: null, percent: null, source: 'historical-close', lastTradeAt: '2026-09-22T10:00:00Z' }] } });
    const stock = stocks.find(s => decodeURIComponent(url.pathname).includes(s.instrumentId))!;
    if (url.pathname.endsWith('/chart')) {
      const timeframe = url.searchParams.get('timeframe');
      const intraday = ['1m', '5m', '15m'].includes(timeframe!);
      const bars = Array.from({ length: 60 }, (_, i) => ({ time: intraday ? new Date(Date.parse('2026-09-22T03:45:00Z') + i * 60_000).toISOString() : new Date(Date.parse('2026-06-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10), open: 310 + i / 4, high: 314 + i / 4, low: 308 + i / 4, close: 311 + i / 4, volume: 10000 + i * 50 }));
      return route.fulfill({ json: { bars, timeframe, instrumentId: stock.instrumentId, latestCandleAt: bars.at(-1)?.time, source: 'Dhan historical candles' } });
    }
    return route.fulfill({ json: { instrument: { ...stock.instrument, _id: stock.instrumentId, isin: stock.isin }, facts: [{ field: 'marketCap', value: 80740, period: '2026-06-30', observedAt: '2026-09-23T00:00:00Z', source: 'dhan' }], qualification: { source: stock.source, month: '2026-09', note: stock.note, cutoff: '2026-09-23T10:00:00Z', rule: stock.source === 'scan' ? initialMonthlyRule : null, checks: [] } } });
  });
}

test('qualified stock prices open an interactive chart and preserve manual qualification and list filters', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page); await page.goto('/qualification');
  await expect(page.getByRole('columnheader', { name: 'Last price' })).toBeVisible();
  await expect(page.getByText('₹326.85', { exact: true })).toBeVisible();
  await expect(page.getByText('Historical close', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('figure', { name: 'FEDERALBNK price and volume chart' })).toBeVisible();
  await expect(drawer.locator('canvas').first()).toBeVisible();
  await expect(drawer.getByLabel('Chart data timestamp')).toContainText('Completed daily sessions. The live price updates separately.');
  await expect(drawer.getByText('Day high', { exact: true })).toBeVisible();
  await expect(drawer.getByText('₹80,740.00 Cr', { exact: true })).toBeVisible();
  await drawer.getByText('View qualification rules', { exact: true }).click();
  await expect(drawer.getByText('Qualification conditions', { exact: true })).toBeVisible();
  await drawer.getByText('15m', { exact: true }).click();
  await expect(drawer.getByLabel('Chart data timestamp')).toContainText('Completed candles. The live price updates separately.');
  await expect(drawer.getByRole('figure')).toBeVisible();
  await drawer.getByText('Line', { exact: true }).click();
  await drawer.getByRole('checkbox').uncheck();
  await page.screenshot({ path: '../.tools/artifacts/stock-details-light.png' });
  await drawer.getByRole('button', { name: 'Next stock' }).click();
  await expect(drawer.getByRole('figure', { name: 'SBIN price and volume chart' })).toBeVisible();
  await expect(drawer.getByText('My separate long-term research.', { exact: true })).toBeVisible();
  await expect(drawer.getByText('View qualification rules', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Historical close', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search qualified stocks' }).fill('Federal');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer.getByRole('figure')).toBeVisible();
  expect(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '../.tools/artifacts/stock-details-mobile.png' });
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search qualified stocks' })).toHaveValue('Federal');
  expect(errors).toEqual([]);
});

test('live quote updates reach the list and open details; disconnect removes the live label', async ({ page }) => {
  await fixture(page); await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await expect(page.getByRole('dialog').getByText('Snapshot', { exact: true })).toBeVisible();
  const update = { ...quote('NSE:1023', 330), source: 'dhan-stream' };
  await page.evaluate(value => {
    const feeds = (window as unknown as { stockTestFeeds: { ids: string[]; onmessage: ((event: { data: string }) => void) | null }[] }).stockTestFeeds;
    for (const feed of feeds) if (feed.ids.includes(value.instrumentId)) feed.onmessage?.({ data: JSON.stringify({ quotes: [value], status: { state: 'streaming' } }) });
  }, update);
  await expect(page.getByRole('dialog').getByText('₹330.00', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Live', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const feeds = (window as unknown as { stockTestFeeds: { onmessage: ((event: { data: string }) => void) | null }[] }).stockTestFeeds;
    for (const feed of feeds) feed.onmessage?.({ data: JSON.stringify({ status: { state: 'reconnecting', message: 'Reconnecting. Last received prices remain visible.' } }) });
  });
  await expect(page.getByRole('dialog').getByText('Live', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByText('Last received', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('₹330.00', { exact: true })).toBeVisible();
});
