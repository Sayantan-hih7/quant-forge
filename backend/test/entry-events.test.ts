import test from 'node:test';
import assert from 'node:assert/strict';
import { freshEntry } from '../src/modules/paper-trading/services/entry-events.js';
import type { EvaluationResult } from '../src/modules/engine/services/engine.service.js';

const result = (checks: EvaluationResult['checks']): EvaluationResult => ({ id: 'NSE:1', matched: true, status: 'qualified', checks });
const cross = { field:'ema', matched:true, eventKey:'0.0:2026-09-25T10:00:00Z' };
test('a persisted crossover blocks repeated entries but preserves unrelated OR branches and missing inputs', () => {
  const consumed = new Set([cross.eventKey]);
  for (const logic of ['AND','OR']) {
    const rule={logic:'AND',groups:[{logic,conditions:[{},{}]}]};
    for(const state of [true,false,null]) {
      const output=freshEntry(rule,result([cross,{field:'close',matched:state}]),consumed);
      const expected=logic==='AND'?false:state;
      assert.equal(output.evaluation.matched,expected);
      assert.equal(output.evaluation.status,expected===true?'qualified':expected===false?'rejected':'unavailable');
      assert.deepEqual(output.eventKeys,[]);
    }
  }
  const next={...cross,eventKey:'0.0:2026-10-02T10:00:00Z'};
  assert.deepEqual(freshEntry({logic:'AND',groups:[{logic:'AND',conditions:[{}]}]},result([next]),consumed).eventKeys,[next.eventKey]);
});
test('only successful OR groups consume crossover events',()=>{
  const rule={logic:'OR',groups:[{logic:'AND',conditions:[{},{}]},{logic:'AND',conditions:[{}]}]};
  const next={...cross,eventKey:'1.0:new'};
  const output=freshEntry(rule,result([cross,{field:'close',matched:false},next]),new Set());
  assert.equal(output.evaluation.matched,true);
  assert.deepEqual(output.eventKeys,[next.eventKey]);
});
