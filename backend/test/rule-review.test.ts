import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewStrategy, type RuleReviewIssue } from '../src/modules/strategies/services/rule-review.service.js';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';
import { ruleReviewRequestSchema } from '../src/modules/strategies/validations/rule-review.validation.js';

const c = (operator = 'gt', value = 70, extra = {}) => ({ left:'rsi',leftFrame:'1d',operator,rightType:'value',right:'ema20',rightFrame:'1d',value,multiplier:1,tolerance:2,...extra });
type Condition=ReturnType<typeof c>;
function draft(conditions:Condition[], logic='AND') {
  const d=structuredClone(researchPresets[1].draft);
  d.entry={...d.entry,groups:[{logic,conditions}]};
  d.exit={...d.exit,enabled:false,groups:[]};
  return d;
}
const simplify=(issues:RuleReviewIssue[])=>issues.filter(i=>i.fix);

test('contradictory AND thresholds block saving; OR alternatives remain possible',()=>{
  const review=reviewStrategy(draft([c('gt',70),c('lt',30)]));
  assert.equal(review.blocked,true);
  assert.match(review.issues[0].title,/Buy rules cannot match/);
  assert.equal(simplify(review.issues).length,0,'Ambiguous intent has no automatic fix');
  assert.equal(reviewStrategy(draft([c('gt',70),c('lt',30)],'OR')).blocked,false);
});

test('strict bounds, exclusions, single-point ranges and mathematical domains',()=>{
  for(const [conditions,blocked] of [
    [[c('gte',50),c('lte',50)],false],[[c('gt',50),c('lte',50)],true],
    [[c('eq',50),c('neq',50)],true],[[c('between',40,{upper:60}),c('notBetween',30,{upper:70})],true],
    [[c('between',50,{upper:50}),c('eq',50)],false],[[c('notBetween',50,{upper:50}),c('eq',50)],true],
    [[c('gt',100)],true],[[c('lt',0)],true],[[c('eq',2,{left:'bullishEngulfing'})],true],
  ] as [Condition[],boolean][]) assert.equal(reviewStrategy(draft(conditions)).blocked,blocked,JSON.stringify(conditions));
});

test('groups respect root AND/OR; conflict references omit unrelated conditions',()=>{
  const d=draft([c('gt',70),c('gt',0,{left:'volume'})]);
  d.entry.groups=[{logic:'AND',conditions:[c('gt',70),c('gt',0,{left:'volume'})]},{logic:'AND',conditions:[c('lt',30)]}];
  const result=reviewStrategy(d);
  assert.equal(result.blocked,true);
  assert.deepEqual(result.issues[0].locations,[{side:'entry',group:0,condition:0},{side:'entry',group:1,condition:0}]);
  d.entry.logic='OR';
  assert.equal(reviewStrategy(d).blocked,false);
  d.entry.groups=[{logic:'AND',conditions:[c('gt',70),c('lt',30)]},{logic:'AND',conditions:[c('gt',50)]}];
  const alternative=reviewStrategy(d);
  assert.equal(alternative.blocked,false);
  assert.ok(alternative.issues.some(i=>i.severity==='warning'&&i.title.includes('group 1 cannot match')));
});

test('AND of OR groups is impossible only when every combination fails',()=>{
  const d=draft([]);
  d.entry.groups=[{logic:'OR',conditions:[c('lt',20),c('gt',80)]},{logic:'AND',conditions:[c('between',40,{upper:60})]}];
  assert.equal(reviewStrategy(d).blocked,true);
  d.entry.groups=[{logic:'OR',conditions:[c('lt',20),c('gt',50)]},{logic:'AND',conditions:[c('between',40,{upper:60})]}];
  assert.equal(reviewStrategy(d).blocked,false);
});

test('periods, offsets, and timeframes remain separate measurements',()=>{
  for(const extra of [{leftFrame:'1w'},{leftOffset:1},{leftPeriod:21}]) {
    const result=reviewStrategy(draft([c('gt',70,{leftPeriod:14}),c('lt',30,extra)]));
    assert.equal(result.blocked,false); assert.equal(simplify(result.issues).length,0);
  }
});

test('indicator comparisons recognize aliases and reversed operands, not different multipliers',()=>{
  const a=c('gt',0,{left:'ema5',rightType:'indicator',right:'ema21'});
  const b=c('gte',0,{left:'ema',leftPeriod:21,rightType:'indicator',right:'ema',rightPeriod:5});
  assert.equal(reviewStrategy(draft([a,b])).blocked,true);
  assert.equal(reviewStrategy(draft([a,{...b,multiplier:0.5}])).blocked,false);
  assert.equal(reviewStrategy(draft([c('gt',0,{left:'ema5',rightType:'indicator',right:'ema',rightPeriod:5})])).blocked,true);
  assert.ok(reviewStrategy(draft([c('gte',0,{left:'ema5',rightType:'indicator',right:'ema',rightPeriod:5})])).issues.some(i=>i.title.includes('does not filter')));
});

test('redundancy uses the stricter AND threshold and the broader OR threshold',()=>{
  const and=simplify(reviewStrategy(draft([c('gte',50),c('gt',60)])).issues);
  const or=simplify(reviewStrategy(draft([c('gte',50),c('gt',60)],'OR')).issues);
  assert.equal(and.length,1); assert.equal(and[0].fix?.location.condition,0);
  assert.equal(or.length,1); assert.equal(or[0].fix?.location.condition,1);
  assert.equal(simplify(reviewStrategy(draft([c('gt',50),c('lt',60)])).issues).length,0);
});

test('duplicate suggestions ignore unused value fields but preserve effective parameters',()=>{
  const a=c('gt',0,{left:'ema5',rightType:'indicator',right:'ema21'});
  assert.equal(simplify(reviewStrategy(draft([a,{...a,value:123,tolerance:99}])).issues).length,1);
  assert.equal(simplify(reviewStrategy(draft([a,{...a,multiplier:2}])).issues).length,0);
  const within=c('within',0,{rightType:'indicator'});
  assert.equal(simplify(reviewStrategy(draft([within,{...within,tolerance:5}])).issues).length,0);
  const cross=c('crossAbove',50);
  assert.equal(simplify(reviewStrategy(draft([cross,c('crossAbove',50,{lookback:3})])).issues).length,0);
});

test('current crossovers imply strict position, but past occurrence windows do not',()=>{
  assert.equal(reviewStrategy(draft([c('crossAbove',50),c('lte',50)])).blocked,true);
  assert.equal(reviewStrategy(draft([c('crossAbove',50,{lookback:3}),c('lte',50)])).blocked,false);
  assert.equal(simplify(reviewStrategy(draft([c('crossAbove',50),c('gt',50)])).issues).length,0,'Do not remove event semantics as a state simplification');
});

test('buy/sell overlap is advisory, disabled exits and disjoint thresholds are respected',()=>{
  const d=draft([c('gte',50)]);
  d.exit={...d.exit,enabled:true,groups:[{logic:'AND',conditions:[c('lt',60)]}]};
  assert.equal(reviewStrategy(d).blocked,false);
  assert.ok(reviewStrategy(d).issues.some(i=>i.title==='Buy and sell conditions may overlap'));
  d.exit.groups=[{logic:'AND',conditions:[c('lt',40)]}];
  assert.ok(!reviewStrategy(d).issues.some(i=>i.title.includes('overlap')));
  d.exit={...d.exit,enabled:false,groups:[{logic:'AND',conditions:[c('gt',90),c('lt',10)]}]};
  assert.equal(reviewStrategy(d).blocked,false);
});

test('short candle crossovers flag sparse checks without rejecting the strategy',()=>{
  const result=reviewStrategy(draft([c('crossAbove',50,{leftFrame:'5m',rightFrame:'5m'})]));
  assert.equal(result.blocked,false);
  assert.ok(result.issues.some(i=>i.title.includes('between checks')));
  assert.ok(!reviewStrategy(draft([c('crossAbove',50,{leftFrame:'1w',rightFrame:'1w'})])).issues.some(i=>i.title.includes('between checks')));
});

test('large alternatives are bounded and explicitly reported as incomplete',()=>{
  const d=draft([]);
  d.entry.groups=Array.from({length:6},()=>({logic:'OR',conditions:Array.from({length:12},(_,i)=>c('eq',i))}));
  const result=reviewStrategy(d);
  assert.equal(result.blocked,false);
  assert.match(result.limitations.join(' '),/too many alternative/);
});

test('cost warnings use percentage targets only when the price conversion is known',()=>{
  const d=draft([c('gt',50)]);
  d.risk={...d.risk,stopMode:'fixed',stopPercent:0.1,targetR:1,feePercent:0.1,slippagePercent:0.05};
  assert.ok(reviewStrategy(d).issues.some(i=>i.title.includes('trading costs')));
  d.risk.stopMode='ATR';
  assert.ok(!reviewStrategy(d).issues.some(i=>i.title.includes('trading costs')));
});

test('all research examples remain valid; review does not mutate input',()=>{
  for(const p of researchPresets){const before=JSON.stringify(p.draft);const result=reviewStrategy(p.draft);assert.equal(result.blocked,false,p.title);assert.equal(JSON.stringify(p.draft),before);}
});

test('bounded request validation accepts existing drafts and rejects malformed/oversized rules',()=>{
  const d=draft([c('gt',50)]);
  assert.equal(ruleReviewRequestSchema.safeParse(d).success,true);
  assert.equal(ruleReviewRequestSchema.safeParse({...d,entry:{...d.entry,groups:[{logic:'AND',conditions:Array(13).fill(c())}]}}).success,false);
  assert.equal(ruleReviewRequestSchema.safeParse({...d,entry:{...d.entry,groups:'wrong'}}).success,false);
  assert.equal(ruleReviewRequestSchema.safeParse(draft([c('invented',50)])).success,false);
});

test('numeric simplifications preserve matches over boundaries and ordinary values',()=>{
  const conditions=[c('gt',40),c('gte',40),c('lt',60),c('lte',60),c('eq',50),c('neq',50),c('between',40,{upper:60}),c('notBetween',40,{upper:60})];
  const matches=(condition:Condition,x:number)=>{
    const v=condition.value,upper=(condition as Condition&{upper?:number}).upper??0;
    switch(condition.operator){case'gt':return x>v;case'gte':return x>=v;case'lt':return x<v;case'lte':return x<=v;case'eq':return x===v;case'neq':return x!==v;case'between':return x>=v&&x<=upper;default:return x<v||x>upper;}
  };
  for(const a of conditions)for(const b of conditions)for(const logic of ['AND','OR']) {
    const pair=[a,b],review=reviewStrategy(draft(pair,logic));
    for(const x of [0,39.9,40,40.1,49.9,50,50.1,59.9,60,60.1,100]) {
      const results=pair.map(c=>matches(c,x)),match=logic==='AND'?results.every(Boolean):results.some(Boolean);
      if(review.blocked)assert.equal(match,false);
      for(const issue of simplify(review.issues))assert.equal(matches(pair[1-issue.fix!.location.condition],x),match,JSON.stringify({pair,logic,x}));
    }
  }
});
