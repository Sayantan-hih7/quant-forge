import test from 'node:test';
import assert from 'node:assert/strict';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';
import { strategySchema } from '../src/modules/strategies/validations/strategy.validation.js';
import { strategyHistoryPlan } from '../src/modules/backtesting/services/history-plan.js';
import { backtestSchema } from '../src/modules/backtesting/validations/backtest.validation.js';
import { monitoringIds } from '../src/modules/paper-trading/services/scope.service.js';

test('examples use paired rules with horizon-appropriate history and overnight risk', () => {
  for (const example of researchPresets) {
    const draft = strategySchema.parse(example.draft);
    assert.equal(draft.entry.side, 'BUY'); assert.equal(draft.exit.side, 'SELL');
    assert.equal(draft.entry.cadence, draft.exit.cadence);
    const plan = strategyHistoryPlan(draft, '2026-08-01', '2026-09-01');
    assert.ok(plan.dailyFrom && Date.parse('2026-08-01') - Date.parse(plan.dailyFrom) >= 340 * 86400000, 'SMA 200 needs calendar-adjusted warm-up before the trading period');
    if (example.key === 'intraday') { assert.equal(plan.replay, '1m'); assert.ok(plan.intradayFrom! < '2026-08-01'); assert.equal(draft.risk.overnight, false); }
    else { assert.equal(plan.replay, '1d'); assert.equal(plan.intradayFrom, undefined); assert.equal(draft.risk.overnight, true); }
  }
});

test('history plan includes the slower right-hand operand', () => {
  const draft = structuredClone(researchPresets[0].draft);
  const group = draft.entry.groups as { conditions: Record<string, unknown>[] }[];
  group[0].conditions = [{ left: 'close', leftFrame: '5m', operator: 'gt', rightType: 'indicator', right: 'ema20', rightFrame: '1mo' }];
  assert.ok(strategyHistoryPlan(draft, '2026-08-01', '2026-09-01').dailyFrom! < '2022-01-01');
});

test('paper scope removes unqualified entries but retains every held exit', () => {
  assert.deepEqual(monitoringIds(['NSE:1', 'NSE:2'], ['NSE:1', 'NSE:3'], ['NSE:3', 'NSE:4']), ['NSE:1', 'NSE:3', 'NSE:4']);
  assert.deepEqual(monitoringIds(['NSE:1'], ['NSE:1'], ['NSE:3'], true), ['NSE:3']);
});

test('multi-year daily research requires explicit selection-bias acknowledgement', () => {
  const input = { strategyId: researchPresets[2].id, from: '2022-01-01', to: '2025-01-01', universe: 'current', includeManual: false, acknowledgeSelectionBias: true, ids: ['NSE:1'] };
  assert.equal(backtestSchema.safeParse(input).success, true);
  assert.equal(backtestSchema.safeParse({ ...input, acknowledgeSelectionBias: false }).success, false);
  assert.equal(backtestSchema.safeParse({ ...input, from: '2010-01-01' }).success, false);
});
