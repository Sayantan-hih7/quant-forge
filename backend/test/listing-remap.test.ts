import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replacementListing } from '../src/modules/market-data/utils/replacement-listing.js';

const listing = (id: string, extra: Partial<{ exchange: 'NSE' | 'BSE'; isin: string; active: boolean; primary: boolean }> = {}) =>
  ({ _id: id, symbol: 'KABRAEXTRU', exchange: id.startsWith('BSE') ? 'BSE' as const : 'NSE' as const, isin: 'INE900B01029', active: true, primary: false, ...extra });

test('a deactivated listing continues on the same company, preferring its own exchange', () => {
  const dead = listing('NSE:1805', { active: false, primary: true });
  const bse = listing('BSE:524109', { primary: true }), reissued = listing('NSE:8784');
  assert.equal(replacementListing(dead, [dead, bse, reissued])?._id, 'NSE:8784');
  assert.equal(replacementListing(dead, [dead, bse])?._id, 'BSE:524109');
  assert.equal(replacementListing(dead, [listing('NSE:9', { isin: 'INE000X01011' })]), undefined, 'never another company');
  assert.equal(replacementListing(dead, [listing('NSE:8784', { active: false })]), undefined, 'never another inactive listing');
});
