import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parameterError, ruleFields } from '../src/shared/rule-fields.js';
import { indicatorMonths, monthlyHistoryRequirements } from '../src/modules/qualification/services/history-requirements.js';
import { strategyHistoryPlan } from '../src/modules/backtesting/services/history-plan.js';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';
import { monthlyDraft, tradingDraft, draftContext } from '../src/modules/ai/services/proposal.service.js';

const capabilities = { monthlyFields: Object.keys(ruleFields).filter(id => ruleFields[id].monthly),
  technical: Object.keys(ruleFields).filter(id => ruleFields[id].source !== 'facts'),
  snapshotFields: Object.keys(ruleFields).filter(id => ruleFields[id].source === 'facts'), choices: { index: [], sector: [] } };
const condition = { left: 'ema', leftFrame: '1d', leftPeriod: 9, leftOffset: 1, operator: 'crossAbove',
  rightType: 'indicator', right: 'ema', rightFrame: '1d', rightPeriod: 21, rightOffset: 1, value: 0, multiplier: 1, tolerance: 2 };

test('new technical indicators request enough observations and numeric RSI crosses survive AI parsing', () => {
  assert.equal(indicatorMonths('adx',14),27);
  assert.equal(indicatorMonths('supertrend'),10);
  assert.equal(indicatorMonths('bullishEngulfing'),2);
  const preset = researchPresets.find(p => p.draft.entry.horizon === 'swing')!.draft;
  const c = {...condition,left:'rsi',leftPeriod:14,leftOffset:0,rightType:'value',value:30};
  const draft = tradingDraft({name:'RSI momentum',horizon:'swing',cadence:'daily',risk:preset.risk,
    entry:{logic:'AND',groups:[{logic:'AND',conditions:[c]}]},exit:{logic:'AND',groups:[{logic:'AND',conditions:[{...c,operator:'crossBelow',value:70}]}]}},capabilities);
  assert.equal(draft.entry.groups[0].conditions[0].rightType,'value');
  assert.equal(draft.entry.groups[0].conditions[0].value,30);
});

test('AI operands preserve configurable periods and offsets through parsing and context', () => {
  const preset = researchPresets.find(p => p.draft.entry.horizon === 'swing')!.draft;
  const draft = tradingDraft({ name: 'Parameterized crossover', horizon: 'swing', cadence: 'daily', risk: preset.risk,
    entry: { logic: 'AND', groups: [{ logic: 'AND', conditions: [condition] }] },
    exit: { logic: 'OR', groups: [{ logic: 'OR', conditions: [{ ...condition, operator: 'crossBelow' }] }] },
  }, capabilities);
  assert.deepEqual(draft.entry.groups[0].conditions[0], condition);
  assert.deepEqual((draftContext('strategy', draft) as typeof draft).entry.groups[0].conditions[0], condition);
  const c = { field: 'bodyAboveEma', period: 21, offset: 1, operator: 'gte', value: 70,
    operand: 'value', upper: 100, compareField: 'bodyAboveEma', multiplier: 1, distance: 2, lookback: 1, choices: [] };
  const monthly = monthlyDraft({ logic: 'AND', conditions: [c] }, capabilities);
  assert.equal(monthly.groups[0].conditions[0].period, 21);
  assert.equal(monthly.groups[0].conditions[0].offset, 1);
  assert.throws(() => monthlyDraft({ logic: 'AND', conditions: [{ ...c, period: 501 }] }, capabilities));
  assert.throws(() => monthlyDraft({ logic: 'AND', conditions: [{ ...c, field: 'close' }] }, capabilities), /period/);
});

test('history plans cover independent operands, rolling windows and prior candles', () => {
  const monthly = monthlyHistoryRequirements({ groups: [{ conditions: [{ field: 'ema', period: 9, offset: 1, operator: 'crossAbove', lookback: 2,
    operand: 'field', compareField: 'ema', comparePeriod: 50, compareOffset: 3 }] }] }, '2026-09');
  assert.equal(monthly.minimum, 55);
  assert.equal(monthly.months, 165);
  const draft = structuredClone(researchPresets.find(p => p.draft.entry.horizon === 'swing')!.draft);
  draft.entry.groups = [{ logic: 'AND', conditions: [{ ...condition, left: 'close', leftPeriod: undefined, right: 'high52w', rightPeriod: undefined }] }];
  draft.exit.groups = [{ logic: 'OR', conditions: [{ ...condition, left: 'dailyTurnover', leftPeriod: undefined, leftOffset: 0, operator: 'gt', rightType: 'value', value: 20 }] }];
  const plan = strategyHistoryPlan(draft, '2026-09-28', '2026-09-29');
  assert.ok(Date.parse('2026-09-28') - Date.parse(plan.dailyFrom!) >= 400 * 86400000);
  assert.ok(plan.reportsFrom);
  assert.equal(parameterError('close', 5), 'Choose a supported candle period for close');
  assert.ok(parameterError('marketCap', undefined, 1));
  assert.equal(parameterError('ema', 9, 1), undefined);
});


test('benchmark operands and ranking survive AI parsing and request only required history frames', () => {
  const preset = researchPresets.find(p => p.draft.entry.horizon === 'intraday')!.draft;
  const c = {...condition,left:'benchmarkClose',leftFrame:'5m',leftPeriod:undefined,leftOffset:0,leftSettings:{benchmark:'NIFTY IT'},operator:'gt',right:'benchmarkEma',rightFrame:'5m',rightPeriod:20,rightOffset:0,rightSettings:{benchmark:'NIFTY IT'}};
  const draft = tradingDraft({name:'Sector confirmation',horizon:'intraday',cadence:'5m',risk:{...preset.risk,signalRanking:'relativeVolume'},
    entry:{logic:'AND',groups:[{logic:'AND',conditions:[c]}]},exit:{enabled:false,logic:'AND',groups:[]}},capabilities);
  assert.equal(draft.entry.groups[0].conditions[0].leftSettings?.benchmark,'NIFTY IT');
  assert.equal(draft.risk.signalRanking,'relativeVolume');
  const plan = strategyHistoryPlan(draft,'2026-09-28','2026-09-29');
  assert.deepEqual(plan.benchmarks,['NIFTY IT']);
  assert.deepEqual(plan.intradayBenchmarks,['NIFTY IT']);
  assert.deepEqual(plan.dailyBenchmarks,[]);
  assert.ok(plan.intradayFrom!<'2026-09-28');
  draft.entry.groups[0].conditions[0] = {...draft.entry.groups[0].conditions[0],left:'relativeStrength',leftPeriod:20,leftFrame:'1d',rightType:'value'};
  const daily = strategyHistoryPlan(draft,'2026-09-28','2026-09-29');
  assert.deepEqual(daily.intradayBenchmarks,[]);
  assert.deepEqual(daily.dailyBenchmarks,['NIFTY IT']);
  assert.equal(parameterError('openingRangeHigh',15),undefined);
  assert.ok(parameterError('openingRangeHigh',61));
});
