import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookedPaperPnl, markPaperPosition } from '../src/modules/paper-trading/services/valuation.js';

test('paper valuation separates realized partial exits from remaining shares and fees', () => {
  // 10 shares at ₹100 plus ₹1 entry fee; sell 4 at ₹110 less ₹0.44 exit fee.
  const initial = 1000000, remainingCost = 60060, cash = initial - 100100 + 43956;
  assert.equal(bookedPaperPnl(cash, initial, [{ costPaise: remainingCost }]), 3916);
  const mark = markPaperPosition({ quantity: 6, costPaise: remainingCost }, { price: 110, at: '2026-09-28T06:00:00Z', fresh: true, source: 'dhan' });
  assert.equal(mark?.unrealizedPaise, 5940);
  assert.equal(cash + mark!.valuePaise - initial, 3916 + 5940);
});
test('missing quotes never manufacture a valuation; old quotes remain explicitly stale', () => {
  const position = { quantity: 1, costPaise: 10000 };
  assert.equal(markPaperPosition(position), undefined);
  assert.equal(markPaperPosition(position, { price: NaN, at: '', fresh: true, source: 'dhan' }), undefined);
  const mark = markPaperPosition(position, { price: 99, at: '2026-09-25T09:00:00Z', fresh: false, source: 'dhan' });
  assert.equal(mark?.fresh, false);
  assert.equal(mark?.unrealizedPaise, -100);
});
