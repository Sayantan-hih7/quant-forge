import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewMonthlyRule} from '../src/modules/qualification/services/monthly-review.service.js';
import {reviewStrategy} from '../src/modules/strategies/services/rule-review.service.js';
import {monthlyDraft,draftContext} from '../src/modules/ai/services/proposal.service.js';
import {ruleFields} from '../src/shared/rule-fields.js';
import {strategyHistoryPlan} from '../src/modules/backtesting/services/history-plan.js';
import {researchPresets} from '../src/modules/strategies/config/research-presets.js';
const condition=(value:number,operator='gte',extra={})=>({field:'rsi',timeframe:'1mo',operator,operand:'value',value,compareField:'rsi',multiplier:1,distance:2,lookback:1,upper:100,choices:[],...extra});
const monthly=(conditions:ReturnType<typeof condition>[],logic='AND')=>({timeframe:'1mo',logic:'AND',groups:[{logic,conditions}]});
test('monthly rule review blocks impossible AND conditions without changing OR meaning',()=>{
  assert.equal(reviewMonthlyRule(monthly([condition(70),condition(30,'lt')])).blocked,true);
  assert.equal(reviewMonthlyRule(monthly([condition(70),condition(30,'lt')],'OR')).blocked,false);
  const report=reviewMonthlyRule(monthly([condition(40),condition(60)]));
  assert.equal(report.issues.find(i=>i.fix)?.fix?.expectedCondition.value,40);
  assert.ok(report.history.minimum>=14);
});
test('different sources and settings are distinct measurements, defaults remain equivalent',()=>{
  const base={left:'rsi',leftFrame:'1d',operator:'gte',rightType:'value',value:50,right:'rsi',rightFrame:'1d'};
  const report=reviewStrategy({entry:{logic:'AND',groups:[{logic:'AND',conditions:[{...base,leftSettings:{source:'open'}},{...base,leftSettings:{source:'close'}}]}]},exit:{enabled:false,groups:[]}});
  assert.equal(report.issues.filter(i=>i.fix).length,0);
  const duplicate=reviewMonthlyRule(monthly([condition(50),condition(50,'gte',{settings:{source:'close'}})]));
  assert.ok(duplicate.issues.some(i=>i.fix));
});
test('AI proposals preserve settings and reject invented options',()=>{
  const capabilities={monthlyFields:Object.keys(ruleFields).filter(id=>ruleFields[id].monthly),technical:Object.keys(ruleFields).filter(id=>ruleFields[id].source==='candles'),snapshotFields:[],choices:{sector:[],index:[]}};
  const settings={fastPeriod:5,slowPeriod:13,signalPeriod:4,source:'open'};
  const c=condition(0,'gt',{field:'macd',compareField:'macd',settings});
  const proposal={...c} as Record<string,unknown>;delete proposal.timeframe;
  const draft=monthlyDraft({logic:'AND',conditions:[proposal]},capabilities);
  assert.deepEqual(draft.groups[0].conditions[0].settings,settings);
  assert.deepEqual(draftContext('monthly',draft)?.groups?.[0].conditions[0].settings,settings);
  assert.throws(()=>monthlyDraft({logic:'AND',conditions:[{...c,settings:{source:'invented'}}]},capabilities));
});
test('benchmark and pivot history are planned separately from execution minutes',()=>{
  const d=structuredClone(researchPresets[0].draft);
  d.entry.groups=[{logic:'AND',conditions:[{left:'relativeStrength',leftFrame:'1d',leftPeriod:30,leftSettings:{benchmark:'SENSEX'},operator:'gt',rightType:'value',value:0,right:'close',rightFrame:'1d'},{left:'close',leftFrame:'5m',operator:'gt',rightType:'indicator',right:'pivotR1',rightFrame:'5m',rightSettings:{pivotFrame:'1mo'}}]}];
  const plan=strategyHistoryPlan(d,'2026-09-01','2026-09-30');
  assert.deepEqual(plan.benchmarks,['SENSEX']);
  assert.ok(Date.parse('2026-09-01')-Date.parse(plan.dailyFrom!)>=95*86400000);
});

test('AI preserves new indicator parameters and history review counts their complete warmup',()=>{
  const capabilities={monthlyFields:Object.keys(ruleFields).filter(id=>ruleFields[id].monthly),technical:Object.keys(ruleFields).filter(id=>ruleFields[id].source==='candles'),snapshotFields:[],choices:{sector:[],index:[]}};
  const rows=[
    condition(50,'gte',{field:'connorsRsi',compareField:'connorsRsi',period:3,settings:{rankPeriod:24,streakPeriod:2}}),
    condition(0,'gt',{field:'dema',compareField:'dema',period:20,settings:{source:'hlc3'}}),
    condition(100,'gt',{field:'candleAverage',compareField:'candleAverage',settings:{source:'ohlc4'}}),
  ].map(c=>{const proposal={...c} as Record<string,unknown>;delete proposal.timeframe;return proposal;});
  const draft=monthlyDraft({logic:'AND',conditions:rows},capabilities);
  assert.equal(draft.groups[0].conditions[0].settings?.rankPeriod,24);
  assert.equal(draft.groups[0].conditions[1].settings?.source,'hlc3');
  assert.equal(reviewMonthlyRule(draft).history.minimum,39);
  assert.throws(()=>monthlyDraft({logic:'AND',conditions:[{...rows[0],settings:{rankPeriod:0}}]},capabilities));
  assert.throws(()=>monthlyDraft({logic:'AND',conditions:[{...rows[0],settings:{source:'open'}}]},capabilities));
});
