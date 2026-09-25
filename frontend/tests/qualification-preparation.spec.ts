import { expect, test } from '@playwright/test';
import { initialMonthlyRule } from '../src/modules/qualification/config/monthlyFields';

test('missing-input breakdown opens the affected stocks and retries without publishing', async ({ page }) => {
  const run = { _id: 'fixture-gaps', month: '2026-09', status: 'completed', stage: 'evaluating', total: 3, processed: 3,
    qualified: 1, rejected: 1, unavailable: 1, cutoff: '2026-09-25T10:00:00Z', fingerprint: 'fixture', revision: 1,
    dataGaps: [{ field: 'pledge', stocks: 1 }] };
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', rule: { rule: initialMonthlyRule, fingerprint: 'fixture', revision: 1 }, runs: [run], universe: null, canRun: true } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: [] }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { monthlyFields: ['pledge'], technical: [], snapshotFields: ['pledge'], choices: { index: [], sector: [] } } }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
  const requests: string[] = [];
  await page.route('**/api/qualification/runs', route => { requests.push(route.request().method()); return route.fulfill({ json: { id: 'queued' } }); });
  await page.route('**/api/qualification/runs/fixture-gaps/results?*', route => {
    expect(new URL(route.request().url()).searchParams.get('status')).toBe('unavailable');
    return route.fulfill({ json: { total: 0, rows: [] } });
  });
  await page.goto('/qualification');
  await expect(page.getByText('Promoter pledge: 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View affected stocks' }).click();
  await expect(page.getByText('Missing data is not a failed rule')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Retry missing data' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests).toEqual(['POST']);
});

test('zero-match incomplete scan names the missing field and explains the existing published list', async ({ page }) => {
  const run = { _id: 'fixture-roe-gap', month: '2026-09', status: 'completed', stage: 'evaluating', total: 5458, processed: 5458,
    qualified: 0, rejected: 5144, unavailable: 314, awaitingHistory: 0, cutoff: '2026-09-25T06:30:00Z', fingerprint: 'fixture', revision: 1,
    preparation: { processed: 451, total: 451, downloaded: 1134, cached: 641, failed: 14, ruledOut: 5007, failures: [] } };
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', rule: { rule: initialMonthlyRule, fingerprint: 'fixture', revision: 1 }, runs: [run],
    universe: { runId: 'older-published', members: Array.from({ length: 168 }, (_, i) => ({ instrumentId: `NSE:${i}`, source: 'scan' })) }, canRun: true,
    readiness: { companies: 5458, fields: [{ field: 'roe', kind: 'fact', withData: 0 }] },
  } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: [] }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { monthlyFields: ['roe'], technical: [], snapshotFields: ['roe'], choices: { index: [], sector: [] } } }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
  await page.goto('/qualification?tab=rules');
  await expect(page.getByText('No currently available data for Return on equity across 5,458 companies.')).toBeVisible();
  await expect(page.getByText('No confirmed matches — some stocks are still undecided')).toBeVisible();
  await expect(page.getByText(/Your published list still contains 168 stocks/)).toBeVisible();
});

test('monthly results separate insufficient IPO history from missing data and do not label it rejected', async ({ page }) => {
  const run = { _id: 'fixture-history', month: '2026-09', status: 'completed', stage: 'evaluating', total: 3, processed: 3,
    qualified: 1, rejected: 0, unavailable: 1, awaitingHistory: 1, cutoff: '2026-09-25T05:00:00Z', fingerprint: 'fixture', revision: 1 };
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', rule: { rule: initialMonthlyRule, fingerprint: 'fixture', revision: 1 }, runs: [run], universe: null, canRun: true } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: [] }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { monthlyFields: ['ema5', 'ema21', 'marketCap'], technical: ['ema5', 'ema21'], snapshotFields: ['marketCap'], choices: { index: [], sector: [] } } }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
  const requested: string[] = [];
  await page.route('**/api/qualification/runs/fixture-history/results?*', route => {
    requested.push(new URL(route.request().url()).searchParams.get('status') ?? 'all');
    return route.fulfill({ json: { total: 1, rows: [{ _id: 'history:1', instrumentId: 'NSE:1', instrument: { symbol: 'NEWLISTING', name: 'Example new listing', exchange: 'NSE' }, status: 'awaiting_history', checks: [
      { field: 'ema21', matched: null, code: 'insufficient_monthly_history', availableMonths: 8, requiredMonths: 21, reason: 'ema21: 8 of 21 completed monthly candles available. More monthly history is needed; the forming month is excluded.' },
    ] }] } });
  });
  await page.goto('/qualification');
  await expect(page.getByText('Awaiting history 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Missing data 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review results', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter scan results' }).click();
  await page.getByText('Awaiting monthly history', { exact: true }).last().click();
  await expect(page.getByText('These stocks need more completed monthly candles')).toBeVisible();
  await expect(page.getByText('NEWLISTING', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand row' }).click();
  await expect(page.getByText(/ema21: 8 of 21 completed monthly candles/)).toBeVisible();
  expect(requested).toContain('awaiting_history');
  await expect(page.getByText('Did not match', { exact: true })).toHaveCount(0);
});

test('qualification shows real data stages and provider cooldown without pretending evaluation is complete', async ({ page }) => {
  const run = { _id: 'fixture-run', month: '2026-09', status: 'running', stage: 'fundamentals', total: 5458, processed: 0, qualified: 0, rejected: 0, unavailable: 0,
    cutoff: '2026-09-23T10:00:00Z', fingerprint: 'fixture', revision: 1,
    preparation: { processed: 123, total: 2549, downloaded: 100, cached: 23, failed: 0, ruledOut: 2909, failures: [] } };
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', rule: { rule: initialMonthlyRule, fingerprint: 'fixture', revision: 1 }, runs: [run], universe: null, canRun: false,
    providerRetryAt: new Date(Date.now() + 60000).toISOString(), readiness: { companies: 5458, fields: [{ field: 'ema21', kind: 'history', withData: 0, requiredMonths: 21 }] },
  } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: [] }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { monthlyFields: ['ema5', 'ema21', 'marketCap'], technical: ['ema5', 'ema21'], snapshotFields: ['marketCap'], choices: { index: [], sector: [] } } }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
  await page.goto('/qualification');
  await expect(page.getByText('Preparing data for your saved rules')).toBeVisible();
  await expect(page.getByText('Loading company data', { exact: true })).toBeVisible();
  await expect(page.getByText('Waiting for Dhan’s rate limit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review results', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publish qualified list', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run saved rules', exact: true })).toBeDisabled();
  await expect(page.getByText('Some data required by your saved rule is missing')).toHaveCount(0);
  await expect(page.getByText('Your first monthly scan is in progress')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('published backend stocks retain NSE and BSE index previews and focused navigation', async ({ page }) => {
  await page.route('**/api/qualification', route => route.fulfill({ json: { month: '2026-09', rule: { rule: initialMonthlyRule, fingerprint: 'fixture', revision: 1 }, runs: [], universe: { runId: 'published', members: [{ instrumentId: 'NSE:1', source: 'scan' }] }, canRun: false } }));
  await page.route('**/api/qualification/universe', route => route.fulfill({ json: [{ instrumentId: 'NSE:1', isin: 'INE000A00001', source: 'scan', addedAt: '2026-09-23', instrument: { symbol: 'FIXTURE', name: 'Fixture company', exchange: 'NSE' }, metrics: { sector: 'Technology', index: ['nifty-50', 'bse-sensex'], delivery: 50 } }] }));
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { monthlyFields: [], technical: [], snapshotFields: [], choices: { sector: [], index: [{ value: 'nifty-50', label: 'NIFTY 50' }, { value: 'bse-sensex', label: 'BSE SENSEX' }] } } }));
  await page.route('**/api/market-indices', route => route.fulfill({ json: { quotes: [], sources: [], refreshAfterMs: 60000 } }));
  await page.goto('/qualification');
  await expect(page.getByRole('link', { name: 'View NIFTY 50 index', exact: true })).toBeVisible();
  const bse = page.getByRole('link', { name: 'View BSE SENSEX index', exact: true });
  await bse.hover();
  await expect(page.getByRole('region', { name: 'BSE SENSEX preview' })).toBeVisible();
  await bse.click();
  await expect(page).toHaveURL(/market-data\/indices\?exchange=BSE.*index=bse%3Abse-sensex/);
});
