import { expect, test } from '@playwright/test';
import { initialMonthlyRule } from '../src/modules/qualification/config/monthlyFields';

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
