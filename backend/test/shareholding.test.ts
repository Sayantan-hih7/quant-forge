import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBseShareholding, parseNseShareholding, selectBsePledge, selectNseFiling } from '../src/modules/market-data/sources/shareholding.js';

const now = '2026-09-25T10:00:00Z';
function filing({ shares = '1000', encumbered = '', declared = true, isin = 'INE000A01010', period = '2026-06-30', promoter = true } = {}) {
  const fact = (key: string, value: string, ref = 'main') => `<s:${key} contextRef="${ref}">${value}</s:${key}>`;
  return `<x:xbrl xmlns:x="http://www.xbrl.org/2003/instance" xmlns:s="http://www.bseindia.com/xbrl/shp" xmlns:d="http://xbrl.org/2006/xbrldi">
    <x:context id="main"><x:entity><x:identifier>DEMO</x:identifier></x:entity><x:period><x:instant>${period}</x:instant></x:period></x:context>
    <x:context id="aggregate"><x:entity><x:identifier>DEMO</x:identifier></x:entity><x:period><x:instant>${period}</x:instant></x:period><x:scenario><d:explicitMember dimension="s:CategoryOfShareholdersAxis">s:ShareholdingOfPromoterAndPromoterGroupMember</d:explicitMember></x:scenario></x:context>
    ${fact('ISIN', isin)}${fact('DateOfReport', period)}
    ${['UnderPledged', 'UnderNonDisposalUndertaking', 'OtherThanByWayOfPledgeOrNDU'].map(kind => fact(`WhetherAnySharesHeldByPromotersAreEncumbered${kind}ForPromoterAndPromoterGroup`, declared ? 'false' : 'true')).join('')}
    ${promoter ? fact('NumberOfShares', shares, 'aggregate') : ''}
    ${encumbered ? fact('NumberOfSharesEncumbered', encumbered, 'aggregate') : ''}
    ${fact('NumberOfSharesEncumbered', '999', 'individual-shareholder')}
  </x:xbrl>`;
}
test('NSE filing uses promoter-group shares, not total company shares or individual shareholders', () => {
  const report = parseNseShareholding(filing({ encumbered: '70', declared: false }), 'INE000A01010', '2026-06-30', now);
  assert.equal(report.value, 7); assert.equal(report.evidence, 'reported-total');
});
test('zero requires an explicit no-encumbrance declaration; absent facts never mean zero', () => {
  assert.equal(parseNseShareholding(filing(), 'INE000A01010', '2026-06-30', now).value, 0);
  assert.throws(() => parseNseShareholding(filing({ declared: false }), 'INE000A01010', '2026-06-30', now), /unavailable/);
  assert.throws(() => parseNseShareholding(filing({ encumbered: '70' }), 'INE000A01010', '2026-06-30', now), /Invalid/);
});
test('verified no-promoter companies retain not-applicable rather than a fabricated percentage', () => {
  const report = parseNseShareholding(filing({ promoter: false }), 'INE000A01010', '2026-06-30', now, true);
  assert.equal(report.value, 'not-applicable'); assert.equal(report.evidence, 'no-promoters');
  assert.throws(() => parseNseShareholding(filing({ promoter: false }), 'INE000A01010', '2026-06-30', now), /total is unavailable/);
});
test('capital-allotment reports use the XBRL observation instant rather than the preparation date', () => {
  const xml = filing().replace('<s:DateOfReport contextRef="main">2026-06-30', '<s:DateOfReport contextRef="main">2026-07-02');
  assert.equal(parseNseShareholding(xml, 'INE000A01010', '2026-06-30', now).period, '2026-06-30');
});
test('filing identity, period, range and XML entities are validated', () => {
  assert.throws(() => parseNseShareholding(filing(), 'INE999A01010', '2026-06-30', now), /ISIN/);
  assert.throws(() => parseNseShareholding(filing(), 'INE000A01010', '2026-03-31', now), /date/);
  assert.throws(() => parseNseShareholding(filing({ period: '2025-06-30' }), 'INE000A01010', '2025-06-30', now), /stale/);
  assert.throws(() => parseNseShareholding(filing({ encumbered: '1001', declared: false }), 'INE000A01010', '2026-06-30', now), /Invalid/);
  assert.throws(() => parseNseShareholding('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]>' + filing(), 'INE000A01010', '2026-06-30', now), /Unsupported/);
});
test('NSE selects the newest published report and validates actual XML ISIN independently of stale list metadata', () => {
  const rows = [
    { symbol: 'DEMO', date: '30-JUN-2026', broadcastDate: '20-JUL-2026 12:00:00', xbrl: 'old', isin: 'OLD', pr_and_prgrp: '50' },
    { symbol: 'DEMO', date: '30-JUN-2026', broadcastDate: '22-JUL-2026 12:00:00', xbrl: 'revision', pr_and_prgrp: '50' },
    { symbol: 'DEMO', date: '30-SEP-2026', broadcastDate: '20-OCT-2026 12:00:00', xbrl: 'future' },
  ];
  assert.equal(selectNseFiling(rows, 'DEMO', now)?.url, 'revision');
  assert.equal(selectNseFiling(rows, 'OTHER', now), undefined);
});
test('BSE selects exact scrip and fresh reporting date; never substitutes depository pledge percentages', () => {
  const listing = { Fld_ScripCode: 123456, Fld_EndDate: '20260630', SHP_PulishedTime: '2026-07-20T12:00:00' };
  assert.equal(selectBsePledge({ Table: [listing] }, '123456', now)?.period, '2026-06-30');
  assert.equal(selectBsePledge({ Table: [listing] }, '999999', now), undefined);
  const payload = { Table: [{ Fld_IsPledge: true, Fld_IsNDU: false, Fld_IsOtherEncumbrances: false }], Table1: [
    { Fld_Code: 'A1a', Fld_Level: 'individual', Fld_TotalNoOfShares: 100, Fld_TotalencumberedNoOfShares: 70 },
    { Fld_Code: 'STA1A2', Fld_Level: 'A=A1+A2', Fld_TotalNoOfShares: 1000, Fld_TotalencumberedNoOfShares: 70 },
  ] };
  assert.equal(parseBseShareholding(payload, '2026-06-30', now).value, 7);
  assert.throws(() => parseBseShareholding({ Table: payload.Table, Table1: [{ ...payload.Table1[1], Fld_TotalencumberedNoOfShares: null, Noofsharespledged: 70 }] }, '2026-06-30', now), /unavailable/);
});
test('BSE missing totals become not-applicable only with verified all-public ownership and no-encumbrance declarations', () => {
  const payload = { Table: [{ Fld_IsPledge: false, Fld_IsNDU: false, Fld_IsOtherEncumbrances: false }], Table1: [] };
  assert.throws(() => parseBseShareholding(payload, '2026-06-30', now), /unavailable/);
  assert.equal(parseBseShareholding(payload, '2026-06-30', now, true).value, 'not-applicable');
  assert.throws(() => parseBseShareholding({ ...payload, Table: [{ Fld_IsPledge: true }] }, '2026-06-30', now, true), /unavailable/);
});
test('BSE summary explicitly identifies zero promoters even when employee trusts hold nonpublic shares', () => {
  const summary = { Table: [{ Fld_IsPledge: false, Fld_PromoterSharesNdu: false, Fld_PromoterSharesOtherEncumbrance: false }],
    Table1: [{ Fld_Code: 'STA1A2', FLD_LEVEL: 'A=A1+A2', Fld_TotalNoOfShares: 0 }] };
  assert.equal(parseBseShareholding(summary, '2026-06-30', now).value, 'not-applicable');
});
