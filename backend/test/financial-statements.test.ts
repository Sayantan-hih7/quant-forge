import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFinancialStatements } from '../src/modules/stock-details/providers/financial-statements.js';

const isin = 'INE002A01018', url = 'https://dhan.co/stocks/reliance-industries-ltd-share-price/';
const html = (sections: object, identity = isin) => `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { stock_data: [{ CSM_ISIN_CODE: identity }], fundamentalsData: { isin: identity, ...sections } } } })}</script>`;
const parse = (sections: object) => parseFinancialStatements(html(sections), isin, url, '2026-09-30T12:00:00Z');

test('financial statements keep annual/quarterly and consolidated/standalone series separate, retaining losses and missing values', () => {
  const data = parse({ incomeStat_cq: { YEAR: '202606|202603', REVENUE: '316018|298506', NET_PROFIT: '23196|-20', EPS: '15.48|', EBITDA: '54067|0' }, incomeStat_sy: { YEAR: '202603', REVENUE: '529139', NET_PROFIT: '43851' } });
  assert.equal(data.length, 2);
  assert.equal(data[0].basis, 'consolidated'); assert.equal(data[0].frequency, 'quarterly');
  assert.equal(data[0].periods[0].netProfit, -20); assert.equal(data[0].periods[0].eps, null); assert.equal(data[0].periods[0].ebitda, 0);
  assert.equal(data[0].periods[1].revenue, 316018);
  assert.equal(data[1].basis, 'standalone'); assert.equal(data[1].frequency, 'annual'); assert.equal(data[1].periods[0].revenue, 529139);
});

test('company identity, dated columns and reporting period boundaries are validated', () => {
  assert.throws(() => parseFinancialStatements(html({}, 'WRONG'), isin, url, '2026-09-30'), /ISIN/);
  assert.throws(() => parse({ incomeStat_cq: { YEAR: '202606|202603', REVENUE: '100' } }), /match/);
  assert.throws(() => parse({ incomeStat_cq: { YEAR: '202606|202606', REVENUE: '100|100' } }), /duplicated/);
  assert.throws(() => parse({ incomeStat_cq: { YEAR: '202613', REVENUE: '100' } }), /invalid/);
  const data = parse({ incomeStat_cq: { YEAR: '202612|202609|202606', REVENUE: '120|110|100' } });
  assert.deepEqual(data[0].periods.map(p => p.period), ['2026-06-30']);
  assert.deepEqual(parse({ incomeStat_cq: { YEAR: '202606', REVENUE: 'NA', NET_PROFIT: '' } }), []);
});
