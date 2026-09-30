import { expect, test, type Page } from '@playwright/test';
import { initialMonthlyRule } from '../src/modules/qualification/config/monthlyFields';

const stocks = [
  { instrumentId: 'NSE:1023', isin: 'INE171A01029', source: 'scan', addedAt: '2026-09-23', instrument: { symbol: 'FEDERALBNK', name: 'Federal Bank Limited', exchange: 'NSE' }, metrics: { sector: 'Banking', index: ['nifty-200'], delivery: 48.2 } },
  { instrumentId: 'BSE:500112', isin: 'INE062A01020', source: 'manual', addedAt: '2026-09-23', note: 'My separate long-term research.', instrument: { symbol: 'SBIN', name: 'State Bank of India', exchange: 'BSE' }, metrics: { sector: 'Banking', index: ['bse-sensex'] } },
];
const alternate = { ...stocks[0], instrumentId: 'BSE:500469', instrument: { symbol: 'FEDERALBANK', name: 'Federal Bank Limited', exchange: 'BSE' } };
const listing = (stock: typeof stocks[number]) => ({ ...stock.instrument, _id: stock.instrumentId, isin: stock.isin, active: true });
const quote = (id = 'NSE:1023', price = 326.85) => ({ instrumentId: id, price, previousClose: 331.3, change: price - 331.3, percent: (price - 331.3) / 331.3 * 100, open: 328, high: 332.7, low: 325.95, volume: 1932410, averagePrice: 328.5, lowerCircuit: 300, upperCircuit: 360, lastTradeAt: '2026-09-22T04:45:00Z', receivedAt: '2026-09-22T04:45:00Z', source: 'dhan-snapshot' });
async function fixture(page: Page) {
  await page.clock.setFixedTime(new Date('2026-09-22T04:45:00Z'));
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: route.request().url().endsWith('/session') ? { authenticated: true, mode: 'local' } : {} }));
  let watched: string[] = [];
  await page.route('**/api/watchlists', route => route.fulfill({ json: { lists: [{ _id: 'personal', name: 'Watchlist', ids: watched }], universeCount: 3 } }));
  await page.route('**/api/watchlists/personal/stocks', async route => {
    watched = [...watched, route.request().postDataJSON().instrumentId];
    return route.fulfill({ json: { _id: 'personal', name: 'Watchlist', ids: watched } });
  });
  await page.route('**/api/qualification/membership', route => route.fulfill({ json: { month: '2026-09', revision: 1, published: true, members: stocks } }));
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
    if (url.pathname.endsWith('/quotes')) return route.fulfill({ json: { quotes: [quote(), quote(alternate.instrumentId, 327.1), { ...quote('BSE:500112', 880), previousClose: null, change: null, percent: null, source: 'historical-close', lastTradeAt: '2026-09-22T10:00:00Z' }] } });
    const stock = [...stocks, alternate].find(s => decodeURIComponent(url.pathname).includes(s.instrumentId))!;
    if (url.pathname.endsWith('/listings')) return route.fulfill({ json: { instrument: listing(stock), listings: stock.isin === stocks[0].isin ? [listing(stocks[0]), listing(alternate)] : [listing(stock)] } });
    if (url.pathname.endsWith('/chart')) {
      const timeframe = url.searchParams.get('timeframe');
      const intraday = ['1m', '5m', '15m'].includes(timeframe!);
      const bars = Array.from({ length: 60 }, (_, i) => ({ time: intraday ? new Date(Date.parse('2026-09-22T03:45:00Z') + i * 60_000).toISOString() : new Date(Date.parse('2026-06-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10), open: 310 + i / 4, high: 314 + i / 4, low: 308 + i / 4, close: 311 + i / 4, volume: 10000 + i * 50 }));
      return route.fulfill({ json: { bars, timeframe, instrumentId: stock.instrumentId, latestCandleAt: bars.at(-1)?.time, source: 'Dhan historical candles' } });
    }
    const qualified = stocks.find(row => row.isin === stock.isin)!;
    return route.fulfill({ json: { instrument: listing(stock), facts: [{ field: 'marketCap', value: 80740, period: '2026-06-30', observedAt: '2026-09-23T00:00:00Z', source: 'dhan' }], qualification: { source: stock.source, instrumentId: qualified.instrumentId, exchange: qualified.instrument.exchange, symbol: qualified.instrument.symbol, month: '2026-09', note: stock.note, cutoff: '2026-09-23T10:00:00Z', rule: stock.source === 'scan' ? initialMonthlyRule : null, checks: [] } } });
  });
}

test('overview opens on Today, remembers volume and separates period from candle interval', async ({ page }, testInfo) => {
  const errors: string[] = [], writes: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('/chart?')) requests.push(r.url()); if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(r.url()); });
  await fixture(page); await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  const drawer = page.getByRole('dialog'), figure = drawer.getByRole('figure');
  await expect(drawer.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(drawer.getByLabel('Overview period')).toContainText('Today · 22 Sept 2026');
  await expect(drawer.getByLabel('Overview period')).toContainText('5-minute candles');
  await expect(figure).toBeVisible();
  const plotHeight = () => figure.locator('canvas').evaluateAll(nodes => Math.max(...nodes.map(n => n.getBoundingClientRect().height)));
  // Wait for the chart library to lay out its second pane after the initial paint.
  await expect.poll(plotHeight).toBeLessThan(350);
  const withVolume = await plotHeight();
  await drawer.getByRole('checkbox', { name: 'Volume', exact: true }).uncheck();
  await expect(figure).toHaveAttribute('data-volume-visible', 'false');
  await expect.poll(plotHeight).toBeGreaterThan(withVolume);
  await drawer.getByText('1W', { exact: true }).click();
  await expect(drawer.getByLabel('Overview period')).toContainText('15-minute candles');
  await drawer.getByText('1M', { exact: true }).click();
  await expect(drawer.getByLabel('Overview period')).toContainText('Daily candles');
  await drawer.getByRole('button', { name: 'Open advanced chart' }).click();
  await expect(drawer.getByText('Candle interval', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Each candle represents one trading day.', { exact: false })).toBeVisible();
  await expect(drawer.getByRole('checkbox', { name: 'Volume', exact: true })).not.toBeChecked();
  await drawer.getByText('15m', { exact: true }).click();
  await drawer.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(drawer.getByRole('radio', { name: '1M', exact: true })).toBeChecked();
  await drawer.getByText('Candles', { exact: true }).click();
  await drawer.getByText('Today', { exact: true }).click();
  await drawer.getByLabel('Stock exchange').getByText('BSE', { exact: true }).click();
  await expect(drawer.getByRole('figure', { name: 'FEDERALBANK price chart' })).toBeVisible();
  await expect(drawer.getByRole('radio', { name: 'Candles', exact: true })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('overview-mobile.png'), animations: 'disabled' });
  await page.reload(); await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await expect(drawer.getByRole('checkbox', { name: 'Volume', exact: true })).not.toBeChecked();
  await expect(drawer.getByRole('radio', { name: 'Today', exact: true })).toBeChecked();
  await expect(drawer.getByRole('radio', { name: 'Candles', exact: true })).toBeChecked();
  await drawer.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  await expect(drawer.getByRole('radio', { name: '15m', exact: true })).toBeChecked();
  expect(requests.some(url => url.includes('timeframe=5m&lookbackDays=14'))).toBe(true);
  expect(requests.some(url => url.includes('timeframe=1d&lookbackDays=45'))).toBe(true);
  expect(errors).toEqual([]); expect(writes).toEqual([]);
});

test('overview dates the latest available session and does not show older candles as Today', async ({ page }, testInfo) => {
  await fixture(page); await page.clock.setFixedTime(new Date('2026-09-26T06:00:00Z'));
  await page.route('**/api/stocks/quotes?*', route => route.fulfill({ json: { quotes: [{ ...quote(), lastTradeAt: '2026-09-25T10:00:00Z' }] } }));
  await page.route('**/api/stocks/*/chart?*', route => {
    const bars = ['2026-09-24T03:45:00Z', '2026-09-25T03:45:00Z', '2026-09-25T03:50:00Z'].map(time => ({ time, open:100,high:110,low:99,close:105,volume:100 }));
    return route.fulfill({ json: { timeframe:'5m', bars, source:'fixture', instrumentId:stocks[0].instrumentId, latestCandleAt:bars.at(-1)!.time } });
  });
  await page.goto('/qualification'); await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByLabel('Overview period')).toContainText('Latest available session · 25 Sept 2026');
  await expect(drawer.getByRole('figure')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('overview-weekend.png'), animations: 'disabled' });
  await page.clock.setFixedTime(new Date('2026-09-28T06:00:00Z'));
  await page.route('**/api/stocks/quotes?*', route => route.fulfill({ json: { quotes: [{ ...quote(), lastTradeAt:'2026-09-28T05:59:00Z' }] } }));
  await page.reload(); await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await expect(drawer.getByLabel('Overview period')).toContainText('Today · 28 Sept 2026');
  await expect(drawer.getByText('No candles available for this session yet')).toBeVisible();
  await expect(drawer.getByRole('figure')).toHaveCount(0);
});

test('volume hides its entire pane while RSI and saved volume studies remain usable', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page); await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Volume', exact: true }).click();
  const volume = page.getByRole('dialog', { name: 'Volume settings' });
  await volume.getByRole('checkbox', { name: 'Show volume moving average', exact: true }).check();
  await volume.getByRole('button', { name: 'Apply volume settings' }).click();
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByLabel('Indicator type').click();
  await page.getByRole('option', { name: 'RSI', exact: true }).click();
  await page.getByRole('button', { name: 'Configure indicator', exact: true }).click();
  await page.getByRole('dialog', { name: 'RSI settings' }).getByRole('button', { name: 'Add to chart' }).click();
  await drawer.getByRole('heading', { name: 'Price & volume' }).click();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('Volume SMA 9');
  const count = await drawer.locator('canvas').count();
  await drawer.getByRole('checkbox', { name: 'Volume', exact: true }).uncheck();
  await expect(drawer.getByLabel('Visible indicators')).not.toContainText('Volume SMA');
  await expect(drawer.getByLabel('Visible indicators')).toContainText('RSI');
  await expect.poll(() => drawer.locator('canvas').count()).toBeLessThan(count);
  await drawer.getByRole('checkbox', { name: 'Volume', exact: true }).check();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('Volume SMA 9');
  await expect(drawer.locator('canvas')).toHaveCount(count);
  expect(errors).toEqual([]);
});

test('daily VWAP settings and named layouts persist across reloads and exchange changes', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page); await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByLabel('Indicator type').click();
  await page.getByRole('option', { name: 'VWAP', exact: true }).click();
  await page.getByRole('button', { name: 'Configure indicator', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'VWAP settings' });
  await modal.getByLabel('Reset VWAP').click();
  await page.getByRole('option', { name: 'Each month', exact: true }).click();
  await modal.getByLabel('Line thickness').click();
  await page.getByRole('option', { name: '3 px', exact: true }).click();
  await modal.getByRole('button', { name: 'Add to chart' }).click();
  await drawer.getByRole('heading', { name: 'Price & volume' }).click();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('VWAP · month · 1d');
  await expect(drawer.getByLabel('Visible indicators')).not.toContainText('Intraday only');
  await drawer.getByRole('button', { name: 'Layouts', exact: true }).click();
  await page.getByLabel('Layout name').fill('Monthly view');
  await page.getByRole('button', { name: 'Save current layout' }).click();
  await drawer.getByRole('heading', { name: 'Price & volume' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('VWAP · month · 1d');
  await drawer.getByText('BSE', { exact: true }).click();
  await expect(drawer.getByRole('figure', { name: 'FEDERALBANK price and volume chart' })).toBeVisible();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('VWAP · month · 1d');
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByRole('button', { name: 'Hide VWAP 14' }).click();
  await expect(drawer.getByLabel('Visible indicators')).not.toContainText('VWAP');
  await drawer.getByRole('heading', { name: 'Price & volume' }).click();
  await drawer.getByRole('button', { name: 'Layouts', exact: true }).click();
  await page.getByRole('button', { name: 'Monthly view', exact: true }).click();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('VWAP · month · 1d');
  await page.screenshot({ path: testInfo.outputPath('chart-layouts.png') });
  expect(errors).toEqual([]);
});

test('indicator editor validates MACD and adds volume SMA with editable monthly history', async ({ page }, testInfo) => {
  await fixture(page); await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByLabel('Indicator type').click();
  await page.getByRole('option', { name: 'MACD', exact: true }).click();
  await page.getByRole('button', { name: 'Configure indicator', exact: true }).click();
  const macd = page.getByRole('dialog', { name: 'MACD settings' });
  await macd.getByLabel('Fast EMA').fill('30');
  await macd.getByRole('button', { name: 'Add to chart' }).click();
  await expect(macd.getByText('Fast period must be smaller than slow period')).toBeVisible();
  await macd.getByLabel('Fast EMA').fill('10');
  await macd.getByRole('button', { name: 'Add to chart' }).click();
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByLabel('Indicator type').click();
  await page.getByRole('option', { name: 'Volume', exact: true }).click();
  await page.getByRole('button', { name: 'Configure indicator', exact: true }).click();
  const volume = page.getByRole('dialog', { name: 'Volume settings' });
  await volume.getByRole('checkbox', { name: 'Show volume moving average', exact: true }).check();
  await volume.getByRole('button', { name: 'Apply volume settings' }).click();
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByRole('button', { name: 'Edit EMA 21' }).click();
  const ema = page.getByRole('dialog', { name: 'EMA settings' });
  await ema.getByLabel('Period (candles)').fill('200');
  await ema.getByLabel('Calculate on').click();
  await page.getByRole('option', { name: '1M', exact: true }).click();
  const requested = page.waitForRequest(r => r.url().includes('/chart?') && r.url().includes('timeframe=1mo') && r.url().includes('minBars=300'));
  await ema.getByRole('button', { name: 'Apply indicator settings' }).click();
  await requested;
  await drawer.getByRole('heading', { name: 'Price & volume' }).click();
  await expect(drawer.getByLabel('Visible indicators')).toContainText('Volume SMA 9');
  await expect(drawer.getByLabel('Visible indicators')).toContainText('Needs 200 candles');
  await page.setViewportSize({ width: 390, height: 844 });
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Volume' }).click();
  expect(await volume.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('indicator-editor-mobile.png') });
});

test('qualified pagination and sorting subscribe to the visible sorted stocks', async ({ page }) => {
  await fixture(page);
  const rows = Array.from({ length: 65 }, (_, i) => ({ ...stocks[0], instrumentId: `NSE:${1000 + i}`, instrument: { symbol: `TEST${String(i).padStart(2, '0')}`, name: `Company ${i}`, exchange: 'NSE' }, metrics: { sector: 'Banking', delivery: i } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: rows }));
  await page.route('**/api/stocks/quotes?*', route => { const ids = new URL(route.request().url()).searchParams.get('ids')!.split(','); return route.fulfill({ json: { quotes: ids.map(id => quote(id, Number(id.split(':')[1]))) } }); });
  await page.goto('/qualification');
  const tableRows = page.locator('.monthly-rule-builder tbody tr.ant-table-row');
  await expect(tableRows).toHaveCount(20);
  await expect(page.getByText('1–20 of 65 stocks')).toBeVisible();
  await page.locator('.ant-pagination-options-size-changer').click();
  await page.getByRole('option', { name: '10 / page', exact: true }).click();
  await expect(tableRows).toHaveCount(10);
  await page.getByRole('columnheader', { name: 'Stock', exact: true }).click();
  await expect(tableRows.first()).toContainText('TEST64');
  await expect.poll(() => page.evaluate(() => {
    const feeds = (window as unknown as { stockTestFeeds: { ids: string[]; onmessage: unknown }[] }).stockTestFeeds;
    return feeds.filter(f => f.onmessage).at(-1)?.ids;
  })).toEqual(Array.from({ length: 10 }, (_, i) => `NSE:${1055 + i}`));
  await page.getByTitle('Next Page').click();
  await expect(tableRows.first()).toContainText('TEST54');
  await page.getByRole('columnheader', { name: 'Last price', exact: true }).click();
  await expect(tableRows.first()).toContainText('TEST00');
  await expect(page.getByText('1–10 of 65 stocks')).toBeVisible();
  await page.getByRole('columnheader', { name: 'Last price', exact: true }).click();
  await expect(tableRows.first()).toContainText('TEST64');
  await page.getByRole('searchbox', { name: 'Search qualified stocks' }).fill('TEST02');
  await expect(tableRows).toHaveCount(1);
  await expect(tableRows.first()).toContainText('TEST02');
});

test('qualified stock prices open an interactive chart and preserve manual qualification and list filters', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page); await page.goto('/qualification');
  await expect(page.getByRole('columnheader', { name: 'Last price' })).toBeVisible();
  await expect(page.getByText('₹326.85', { exact: true })).toBeVisible();
  await expect(page.getByText('Historical close', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('figure', { name: 'FEDERALBNK price and volume chart' })).toBeVisible();
  await expect(drawer.locator('canvas').first()).toBeVisible();
  await expect(drawer.getByLabel('Chart data timestamp')).toContainText('Stored candles through');
  await drawer.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(drawer.getByLabel('Stock performance')).toContainText('Session high');
  await expect(drawer.getByText('₹80,740.00 Cr', { exact: true })).toBeVisible();
  await drawer.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  await drawer.getByText('View qualification rules', { exact: true }).click();
  await expect(drawer.getByText('Qualification conditions', { exact: true })).toBeVisible();
  await drawer.getByText('15m', { exact: true }).click();
  await expect(drawer.getByLabel('Chart data timestamp')).toContainText('Stored candles through');
  await expect(drawer.getByRole('figure')).toBeVisible();
  await drawer.getByText('Line', { exact: true }).click();
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByRole('button', { name: 'Remove EMA 5' }).click();
  await drawer.getByRole('heading', { name: 'Price & volume' }).click();
  await page.screenshot({ path: testInfo.outputPath('stock-details-light.png') });
  await drawer.getByRole('button', { name: 'Next stock' }).click();
  await expect(drawer.getByRole('figure', { name: 'SBIN price and volume chart' })).toBeVisible();
  await expect(drawer.getByText('My separate long-term research.', { exact: true })).toBeVisible();
  await expect(drawer.getByText('View qualification rules', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Historical close', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search qualified stocks' }).fill('Federal');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer.getByRole('figure')).toBeVisible();
  expect(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('stock-details-mobile.png') });
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search qualified stocks' })).toHaveValue('Federal');
  expect(errors).toEqual([]);
});

test('live quote updates reach the list and open details; disconnect removes the live label', async ({ page }) => {
  await fixture(page); await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
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

test('Motilal streams start even when the Dhan snapshot fails and session changes remove misleading live labels', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/stocks/quotes?*', route => route.fulfill({ status: 503, json: { message: 'Snapshot unavailable' } }));
  await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { stockTestFeeds: { onmessage: unknown }[] }).stockTestFeeds.filter(f => f.onmessage).length)).toBe(2);
  const update = { ...quote('NSE:1023', 330), source: 'motilal-stream', streamSession: 'mo-1' };
  await page.evaluate(value => {
    const feeds = (window as unknown as { stockTestFeeds: { onmessage: ((event: { data: string }) => void) | null }[] }).stockTestFeeds;
    for (const feed of feeds) feed.onmessage?.({ data: JSON.stringify({ quotes: [value], status: { state: 'streaming', providers: ['motilal'], sessions: { 'NSE:1023': 'mo-1' } } }) });
  }, update);
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('₹330.00', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Live', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Feed connected · Motilal', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const feeds = (window as unknown as { stockTestFeeds: { onmessage: ((event: { data: string }) => void) | null }[] }).stockTestFeeds;
    for (const feed of feeds) feed.onmessage?.({ data: JSON.stringify({ status: { state: 'streaming', providers: ['dhan'], sessions: { 'NSE:1023': 'dhan-2' } } }) });
  });
  await expect(drawer.getByText('Live', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Last received', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Feed connected · Dhan', { exact: true })).toBeVisible();
});

test('exchange switching preserves chart preferences, updates the feed and saves the selected listing', async ({ page }, testInfo) => {
  const errors: string[] = [], charts: string[] = [], additions: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/stocks/') && request.url().includes('/chart?')) charts.push(decodeURIComponent(request.url()));
    if (request.method() === 'POST' && request.url().endsWith('/watchlists/personal/stocks')) additions.push(request.postDataJSON().instrumentId);
  });
  await fixture(page); await page.goto('/qualification');
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('radio', { name: 'NSE', exact: true })).toBeChecked();
  await drawer.getByText('15m', { exact: true }).click();
  await drawer.getByText('Line', { exact: true }).click();
  await drawer.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page.getByRole('button', { name: 'Remove EMA 5' }).click();
  await drawer.getByRole('heading', { name: 'Price & volume' }).click();
  await drawer.getByLabel('Stock exchange').getByText('BSE', { exact: true }).click();
  await expect(drawer.getByRole('figure', { name: 'FEDERALBANK price and volume chart' })).toBeVisible();
  await expect(drawer.getByText('₹327.10', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Qualification uses NSE FEDERALBNK.', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'FEDERALBANK already qualified' })).toBeDisabled();
  await expect(drawer.getByLabel('Visible indicators')).not.toContainText('EMA 5');
  await expect(drawer.getByLabel('Visible indicators')).toContainText('EMA 21');
  await expect(drawer.getByRole('radio', { name: '15m', exact: true })).toBeChecked();
  await expect(drawer.getByRole('radio', { name: 'Line', exact: true })).toBeChecked();
  expect(charts.some(path => path.includes('BSE:500469/chart?timeframe=15m'))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const feeds = (window as unknown as { stockTestFeeds: { ids: string[]; onmessage: unknown }[] }).stockTestFeeds;
    return feeds.filter(feed => feed.onmessage && feed.ids.length === 1).map(feed => feed.ids[0]);
  })).toEqual(['BSE:500469']);
  await drawer.getByRole('button', { name: 'Add FEDERALBANK to watchlist' }).click();
  await expect(drawer.getByRole('button', { name: 'Remove FEDERALBANK from watchlist' })).toBeVisible();
  expect(additions).toEqual(['BSE:500469']);
  await page.screenshot({ path: testInfo.outputPath('exchange-switch.png') });
  await drawer.getByRole('button', { name: 'Next stock' }).click();
  await expect(drawer.getByRole('figure', { name: 'SBIN price and volume chart' })).toBeVisible();
  await expect(drawer.getByRole('radio', { name: 'NSE', exact: true })).toBeDisabled();
  await expect(drawer.getByText('Only BSE is available for this stock')).toBeVisible();
  await drawer.getByRole('button', { name: 'Previous stock' }).click();
  await expect(drawer.getByRole('radio', { name: 'NSE', exact: true })).toBeChecked();
  await drawer.getByLabel('Stock exchange').getByText('BSE', { exact: true }).click();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  await expect(drawer.getByRole('radio', { name: 'NSE', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test('a failed listing lookup leaves the original chart usable and allows retry', async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route('**/api/stocks/*/listings', route => failed ? route.fulfill({ status: 503, json: { message: 'Lookup unavailable' } }) : route.fallback());
  await page.goto('/qualification'); await page.getByRole('button', { name: 'View FEDERALBNK details' }).click();
  await page.getByRole('tab', { name: 'Advanced chart', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('figure')).toBeVisible();
  await expect(drawer.getByRole('radio', { name: 'BSE', exact: true })).toBeDisabled();
  failed = false;
  await drawer.getByRole('button', { name: 'Retry exchanges' }).click();
  await expect(drawer.getByRole('radio', { name: 'BSE', exact: true })).toBeEnabled();
  await drawer.getByLabel('Stock exchange').getByText('BSE', { exact: true }).click();
  await expect(drawer.getByRole('figure', { name: 'FEDERALBANK price and volume chart' })).toBeVisible();
});
