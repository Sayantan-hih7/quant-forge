import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { jobs, redis } from '../src/shared/redis.js';
import { dhanCompanyPage, findDhanCompanyPage, parseDhanPublicCompany } from '../src/modules/market-data/sources/dhan-public-company.js';
import { ensureDhanPublicCompany } from '../src/modules/market-data/services/dhan-public-company.service.js';
import { ensureCompanyData } from '../src/modules/market-data/services/dhan-cache.service.js';
import { requestDhanPublic } from '../src/modules/market-data/providers/dhan-public.client.js';
import { DatasetReceiptModel } from '../src/modules/market-data/models/dataset-receipt.model.js';
import { facts, instruments, latestFacts } from '../src/modules/market-data/repository.js';
import type { Instrument } from '../src/modules/market-data/types.js';

const stock: Instrument = { _id: 'NSE:10440', securityId: '10440', exchange: 'NSE', isin: 'INE326A01037', symbol: 'LUPIN', name: 'Lupin Limited', series: 'EQ', active: true, primary: true, lotSize: 1, observedAt: '2026-09-25' };
const at = '2026-09-25T10:00:00.000Z', url = dhanCompanyPage('lupin-ltd');
const financials = () => ({ isin: stock.isin, roce_roe: { ROE: '23.79', ROCE: '28.42', YEAR: '202603', TYPES_OF_COMPANY: 'CONSOLIDATED' },
  incomeStat_cy: { YEAR: '202603|202503', NET_PROFIT: '5355.5|3306.3' }, bs_c: { YEAR: '202603|202503', TOTAL_EQUITY: '22513.4|17294.3' } });
const html = (fundamentals: unknown, isin = stock.isin) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { stock_data: [{ CSM_ISIN_CODE: isin }], fundamentalsData: fundamentals } } })}</script>`;
after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });

test('public provider waits out cooldown within its deadline without issuing requests', async t => {
  t.mock.method(redis, 'pttl', async () => 60_000);
  const permit = t.mock.method(redis, 'set', async () => { throw new Error('Provider request attempted during cooldown'); });
  const started = Date.now();
  await assert.rejects(requestDhanPublic(url, undefined, 20), { code: 'DHAN_PUBLIC_TIMEOUT' });
  assert.ok(Date.now() - started >= 20);
  assert.equal(permit.mock.callCount(), 0);
  await assert.rejects(requestDhanPublic('https://other.example/data'), { code: 'DHAN_PUBLIC_URL' });
});

test('public search requires exact ISIN, equity type and a safe unambiguous slug', () => {
  const entry = { ISIN_code_s: stock.isin, exchInstname_s: 'EQUITY', Seo_symbol_s: 'lupin-ltd' };
  assert.equal(findDhanCompanyPage({ code: '0', data: [{ ...entry, ISIN_code_s: 'WRONG' }, entry, entry] }, stock.isin), url);
  assert.equal(findDhanCompanyPage({ code: '0', data: [{ ...entry, exchInstname_s: 'ES' }] }, stock.isin), undefined);
  assert.equal(findDhanCompanyPage({ code: '0', data: [entry, { ...entry, Seo_symbol_s: 'another-stock' }] }, stock.isin), undefined);
  assert.throws(() => findDhanCompanyPage({ code: '0', data: [{ ...entry, Seo_symbol_s: '../private' }] }, stock.isin));
});

test('reported financials retain ISIN, period, statement basis and collection time', () => {
  const rows = parseDhanPublicCompany(html(financials()), stock, url, at);
  assert.equal(rows[0].value, 23.79); assert.equal(rows[1].value, 28.42);
  assert.equal(rows[0].period, '2026-03-31'); assert.equal(rows[0].knownAt, at);
  assert.equal(rows[0].statementBasis, 'consolidated'); assert.equal(rows[0].basis, 'observed-snapshot');
  assert.throws(() => parseDhanPublicCompany(html({ ...financials(), isin: 'WRONG' }), stock, url, at), /ISIN/);
  assert.throws(() => parseDhanPublicCompany(html(financials(), 'WRONG'), stock, url, at), /ISIN/);
  assert.throws(() => parseDhanPublicCompany('<script>alert(1)</script>', stock, url, at), /readable/);
});

test('missing ROE is calculated from matching annual statements, without rounding the rule input', () => {
  const data = financials(); data.roce_roe.ROE = '';
  const row = parseDhanPublicCompany(html(data), stock, url, at).find(x => x.field === 'roe')!;
  assert.equal(row.value, 5355.5 / 22513.4 * 100);
  assert.equal(row.basis, 'derived'); assert.equal(row.calculation?.equity, 22513.4);
  assert.equal(row.period, '2026-03-31'); assert.equal(row.knownAt, at);
});

test('calculation refuses missing values, mismatched years, negative equity and mixed statement bases', () => {
  for (const edit of [
    (x: ReturnType<typeof financials>) => { x.bs_c.YEAR = '202503|202403'; },
    (x: ReturnType<typeof financials>) => { x.bs_c.TOTAL_EQUITY = '-1|17294.3'; },
    (x: ReturnType<typeof financials>) => { x.incomeStat_cy.NET_PROFIT = '|3306.3'; },
    (x: ReturnType<typeof financials>) => { x.bs_c.TOTAL_EQUITY = '22513.4'; },
    (x: ReturnType<typeof financials>) => { x.roce_roe.TYPES_OF_COMPANY = 'STANDALONE'; },
  ]) {
    const data = financials(); data.roce_roe.ROE = ''; edit(data);
    assert.equal(parseDhanPublicCompany(html(data), stock, url, at).some(x => x.field === 'roe'), false);
  }
  const data = financials(); data.roce_roe.ROE = ''; data.incomeStat_cy.NET_PROFIT = '0|3306.3';
  assert.equal(parseDhanPublicCompany(html(data), stock, url, at).find(x => x.field === 'roe')?.value, 0);
});

test('future or stale reported ratios cannot be used as current data', () => {
  for (const year of ['202703', '202003', '202613']) {
    const data = financials(); data.roce_roe.YEAR = year; data.incomeStat_cy.YEAR = year;
    assert.equal(parseDhanPublicCompany(html(data), stock, url, at).length, 0);
  }
});
test('obsolete consolidated ratios do not hide current same-basis standalone annual statements', () => {
  const data = { ...financials(),
    roce_roe: { ROE: '99', ROCE: '99', YEAR: '201603', TYPES_OF_COMPANY: 'CONSOLIDATED' },
    incomeStat_cy: { YEAR: '201603', NET_PROFIT: '99' }, bs_c: { YEAR: '201603', TOTAL_EQUITY: '100' },
    incomeStat_sy: { YEAR: '202603', NET_PROFIT: '30' }, bs_s: { YEAR: '202603', TOTAL_EQUITY: '100' },
  };
  const rows = parseDhanPublicCompany(html(data), stock, url, at);
  assert.equal(rows.length, 1); assert.equal(rows[0].value, 30);
  assert.equal(rows[0].statementBasis, 'standalone'); assert.equal(rows[0].period, '2026-03-31');
  assert.equal(rows[0].calculation?.netIncome, 30);
});

test('fallback bypasses old API missing-field cache, shares valid facts across listings and does not overwrite official ROCE', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  const now = new Date().toISOString();
  try {
    await mongoose.connect(uri.toString());
    await instruments.create([stock, { ...stock, _id: 'BSE:500257', exchange: 'BSE', securityId: '500257', primary: false }]);
    await facts.create({ _id: 'official-roce', instrumentId: stock._id, field: 'roce', value: 28.42, source: 'dhan-company', knownAt: now, validUntil: '2099-01-01' });
    await DatasetReceiptModel.create({ _id: `company:${stock._id}:2026-09`, kind: 'company', instrumentId: stock._id, checkedAt: now, fields: ['roce'] });
    let calls = 0;
    const request = async (address: string) => { calls++; return address === url ? html(financials()) : { code: '0', data: [{ ISIN_code_s: stock.isin, exchInstname_s: 'EQUITY', Seo_symbol_s: 'lupin-ltd' }] }; };
    const fallback = (s: Instrument, fields: string[]) => ensureDhanPublicCompany(s, fields, {}, request);
    const dependencies = { request: async () => { throw new Error('Official missing-field cache should be reused'); }, fallback };
    assert.equal(await ensureCompanyData(stock, ['roe', 'roce'], '2026-09', {}, dependencies), true);
    assert.equal(calls, 2); assert.equal(await facts.countDocuments({ field: 'roe' }), 2);
    assert.equal(await facts.countDocuments({ field: 'roce' }), 1);
    assert.equal(await ensureCompanyData(stock, ['roe', 'roce'], '2026-09', {}, dependencies), false);
    assert.equal(calls, 2);
    const roe = await facts.findOne({ instrumentId: stock._id, field: 'roe' }).lean();
    assert.ok(roe?.knownAt && roe.knownAt >= now); assert.equal(roe?.statementBasis, 'consolidated');
    await facts.create({ _id: 'new-official-roe', instrumentId: stock._id, field: 'roe', value: 24,
      source: 'dhan-company', knownAt: new Date().toISOString(), validUntil: '2099-01-01' });
    assert.equal((await latestFacts(stock._id, new Date().toISOString())).find(x => x.field === 'roe')?.value, 24);
    await facts.deleteMany({ field: 'roe' });
    await DatasetReceiptModel.deleteMany({ kind: 'company-public' });
    await assert.rejects(ensureDhanPublicCompany(stock, ['roe'], {}, async address => address === url ? html({ ...financials(), isin: 'WRONG' }) : request(address)), /ISIN/);
    assert.equal(await facts.countDocuments({ field: 'roe' }), 0);
    assert.equal(await ensureDhanPublicCompany(stock, ['roe'], {}, async () => { throw new Error('Retry cooldown ignored'); }), false);
    await DatasetReceiptModel.deleteMany({});
    const unavailable = new Error('Official API unavailable');
    const offline = { request: async () => { throw unavailable; }, fallback };
    assert.equal(await ensureCompanyData(stock, ['roe'], '2026-09', {}, offline), true);
    assert.equal((await latestFacts(stock._id, new Date().toISOString())).find(x => x.field === 'roe')?.value, 23.79);
    await assert.rejects(ensureCompanyData(stock, ['roe', 'marketCap'], '2026-09', {}, offline), error => error === unavailable);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
