import { settingDefaults, type CalculationSettings, type IndicatorKind } from '../../../shared/indicator-settings.js';
import { createHash } from 'node:crypto';
import { ruleFields } from '../../../shared/rule-fields.js';
import type { StrategyDraft } from '../validations/strategy.validation.js';

type Side = 'entry' | 'exit';
type Condition = { leftSettings?: CalculationSettings; rightSettings?: CalculationSettings; left: string; leftFrame: string; leftPeriod?: number; leftOffset?: number; operator: string; rightType: string; right: string; rightFrame: string; rightPeriod?: number; rightOffset?: number; value: number; upper?: number; multiplier?: number; lookback?: number; tolerance?: number };
type Rule = { enabled?: boolean; logic: string; groups: { logic: string; conditions: Condition[] }[]; cadence?: string };
export interface ConditionLocation { side: Side; group: number; condition: number }
export interface RuleReviewIssue { id: string; severity: 'error' | 'warning' | 'suggestion'; title: string; explanation: string; recommendation: string; section: Side | 'risk' | 'setup'; locations: ConditionLocation[]; fix?: { kind: 'remove-condition'; label: string; location: ConditionLocation; expectedCondition: Condition } }
export interface RuleReview { fingerprint: string; issues: RuleReviewIssue[]; positives: string[]; limitations: string[]; blocked: boolean }
type Interval = { lo: number; hi: number; loClosed: boolean; hiClosed: boolean };
type Constraint = { key: string; allowed: Interval[]; domain: Interval[]; exact: boolean };
type Ref = { c: Condition; at: ConditionLocation };
const span = (lo = -Infinity, hi = Infinity, loClosed = false, hiClosed = false): Interval => ({ lo, hi, loClosed, hiClosed });
const valid = (i: Interval) => i.lo < i.hi || i.lo === i.hi && i.loClosed && i.hiClosed;
function intersect(a: Interval[], b: Interval[]): Interval[] {
  return a.flatMap(x => b.map(y => ({ lo: Math.max(x.lo, y.lo), hi: Math.min(x.hi, y.hi),
    loClosed: x.lo === y.lo ? x.loClosed && y.loClosed : x.lo > y.lo ? x.loClosed : y.loClosed,
    hiClosed: x.hi === y.hi ? x.hiClosed && y.hiClosed : x.hi < y.hi ? x.hiClosed : y.hiClosed,
  })).filter(valid));
}
const subset = (a: Interval[], b: Interval[]) => a.every(x => b.some(y => (x.lo > y.lo || x.lo === y.lo && (!x.loClosed || y.loClosed)) && (x.hi < y.hi || x.hi === y.hi && (!x.hiClosed || y.hiClosed))));
function operand(field: string, frame: string, period?: number, offset = 0, settings?: CalculationSettings) {
  const alias = /^(ema|sma)(\d+)$/.exec(field);
  if (alias) { field = alias[1]; period = Number(alias[2]); }
  if (['avgVolume20', 'avgVolume6'].includes(field)) { period = field === 'avgVolume20' ? 20 : 6; field = 'avgVolume'; }
  if (field === 'volumeRatio') field = 'rvol';
  const kind=ruleFields[field]?.indicator as IndicatorKind|undefined;
  const effective = {...(kind?settingDefaults(kind):{}), ...settings};
  if(kind==='adx' && settings?.adxSmoothing===undefined)effective.adxSmoothing=period??14;
  return JSON.stringify([field, frame, period ?? ruleFields[field]?.period?.default ?? null, offset, Object.fromEntries(Object.entries(effective).sort(([a],[b])=>a.localeCompare(b)))]);
}
function signature(c: Condition) {
  return JSON.stringify([operand(c.left,c.leftFrame,c.leftPeriod,c.leftOffset,c.leftSettings), c.operator,
    c.rightType === 'indicator' ? [operand(c.right,c.rightFrame,c.rightPeriod,c.rightOffset,c.rightSettings), c.multiplier ?? 1] : c.value,
    ['between','notBetween'].includes(c.operator) ? c.upper : null,
    ['crossAbove','crossBelow','increasing','decreasing'].includes(c.operator) ? c.lookback ?? 1 : null,
    ['within','aboveBy','belowBy'].includes(c.operator) ? c.tolerance : null]);
}
function constraint(c: Condition): Constraint | undefined {
  if (!c?.left || !c.leftFrame) return;
  const upper=c.upper;
  let key=operand(c.left,c.leftFrame,c.leftPeriod,c.leftOffset,c.leftSettings), domain=[span()], value=c.value, op=c.operator, reverse=false;
  const exact=!op.startsWith('cross');
  if (!exact) { if ((c.lookback ?? 1)!==1) return; op=op==='crossAbove'?'gt':op==='crossBelow'?'lt':op; }
  if (c.rightType==='indicator') {
    if (!['gt','gte','lt','lte','eq','neq'].includes(op)) return;
    const right=operand(c.right,c.rightFrame,c.rightPeriod,c.rightOffset,c.rightSettings), multiple=c.multiplier??1;
    if (!Number.isFinite(multiple) || multiple<=0) return;
    if(multiple===1){reverse=key>right;domain=key===right?[span(0,0,true,true)]:[span()];key=JSON.stringify(['difference',...[key,right].sort()]);}
    else key=JSON.stringify(['difference',key,right,multiple]);
    value=0;
  } else {
    if (['open','high','low','close','price','ema','sma','ema5','ema21','sma50','sma200','vwap'].includes(c.left)) domain=[span(0,Infinity)];
    if (['volume','avgVolume','avgVolume20','tradedValue','marketCap'].includes(c.left)) domain=[span(0,Infinity,true)];
    if (c.left==='rsi'||c.left==='bodyAboveEma'||c.left==='bodyBelowEma') domain=[span(0,100,true,true)];
    if (ruleFields[c.left]?.unit==='flag') domain=[span(0,0,true,true),span(1,1,true,true)];
  }
  if (!Number.isFinite(value)) return;
  let allowed:Interval[];
  if(op==='gt')allowed=[span(value)];
  else if(op==='gte')allowed=[span(value,Infinity,true)];
  else if(op==='lt')allowed=[span(-Infinity,value)];
  else if(op==='lte')allowed=[span(-Infinity,value,false,true)];
  else if(op==='eq')allowed=[span(value,value,true,true)];
  else if(op==='neq')allowed=[span(-Infinity,value),span(value)];
  else if((op==='between'||op==='notBetween')&&upper!=null&&Number.isFinite(upper)&&upper>=value)allowed=op==='between'?[span(value,upper,true,true)]:[span(-Infinity,value),span(upper)];
  else return;
  if(reverse)allowed=allowed.map(i=>span(-i.hi,-i.lo,i.hiClosed,i.loClosed));
  return {key,allowed:intersect(allowed,domain),domain,exact};
}
function branches(rule: Rule, side: Side) {
  let result:Ref[][]=[];
  for(const [gi,g] of rule.groups.entries()){
    const refs=g.conditions.map((c,ci)=>({c,at:{side,group:gi,condition:ci}})), alternatives=g.logic==='OR'?refs.map(c=>[c]):[refs];
    if(!refs.length)return {rows:[],complete:false};
    if(!result.length)result=alternatives;
    else if(rule.logic==='OR')result.push(...alternatives);
    else { if(result.length*alternatives.length>256)return {rows:[],complete:false}; result=result.flatMap(a=>alternatives.map(b=>[...a,...b])); }
  }
  return {rows:result,complete:result.length>0};
}
function examine(refs:Ref[]) {
  const values=new Map<string,Interval[]>(), contributors=new Map<string,Ref[]>(); let exact=true;
  for(const ref of refs){const c=constraint(ref.c);if(!c){exact=false;continue;}exact&&=c.exact;
    contributors.set(c.key,[...(contributors.get(c.key)??[]),ref]);
    const allowed=intersect(values.get(c.key)??c.domain,c.allowed); values.set(c.key,allowed);
    if(!allowed.length)return {impossible:true,exact,values,conflicts:contributors.get(c.key)!};
  }
  return {impossible:false,exact,values,conflicts:[] as Ref[]};
}
const uniqueLocations=(refs:Ref[])=>[...new Map(refs.map(r=>[JSON.stringify(r.at),r.at])).values()];
const sideName=(s:Side)=>s==='entry'?'Buy':'Sell';
const location=(r:Ref)=>`${sideName(r.at.side)} group ${r.at.group+1}, condition ${r.at.condition+1}`;

/** Conservative structural checks. No market data, model calls or profitability score. */
export function reviewStrategy(draft: Pick<StrategyDraft, 'entry' | 'exit'> & Partial<Pick<StrategyDraft, 'risk'>>): RuleReview {
  const issues:RuleReviewIssue[]=[],positives:string[]=[],limitations:string[]=[];
  const rules={entry:draft.entry as unknown as Rule,exit:draft.exit as unknown as Rule};
  const add=(issue:Omit<RuleReviewIssue,'id'>)=>issues.push({...issue,id:`${issue.section}-${issues.length}`});
  const expanded=new Map<Side,ReturnType<typeof branches>>();
  for(const side of ['entry','exit'] as const){
    const rule=rules[side];if(rule.enabled===false)continue;
    if(!Array.isArray(rule.groups)||rule.groups.length>6||rule.groups.some(g=>!Array.isArray(g.conditions)||g.conditions.length>12)){limitations.push(`${sideName(side)} rules need valid condition groups before analysis.`);continue;}
    const paths=branches(rule,side);expanded.set(side,paths);
    if(!paths.complete)limitations.push(`${sideName(side)} has too many alternative combinations or incomplete groups for a complete interaction check.`);
    const examined=paths.rows.map(examine),impossible=paths.complete&&examined.every(r=>r.impossible);
    if(impossible)add({severity:'error',section:side,title:`${sideName(side)} rules cannot match`,explanation:`Every ${side==='entry'?'buy':'sell'} path contains incompatible conditions on the same measurement and timeframe. Changing market data cannot make these conditions true together.`,recommendation:'Edit the conflicting conditions. Keep the requirement you intended; the app will not choose your trading direction for you.',locations:uniqueLocations(examined.flatMap(r=>r.conflicts))});
    for(const [gi,g] of rule.groups.entries()){
      const refs=g.conditions.map((c,condition)=>({c,at:{side,group:gi,condition}}));
      if(!impossible&&g.logic==='AND'&&examine(refs).impossible)add({severity:'warning',section:side,title:`${sideName(side)} group ${gi+1} cannot match`,explanation:'This AND group contains incompatible conditions. Other alternatives may still match, or the full rule has too many combinations to check.',recommendation:'Edit this group or remove its unintended condition.',locations:uniqueLocations(examine(refs).conflicts)});
      const already=new Set<number>();
      for(let i=0;i<refs.length;i++)for(let j=i+1;j<refs.length;j++){
        if(already.has(i)||already.has(j))continue;
        const a=refs[i],b=refs[j],duplicate=signature(a.c)===signature(b.c),ca=constraint(a.c),cb=constraint(b.c);
        let remove:Ref|undefined,keep:Ref|undefined;
        if(duplicate){remove=b;keep=a;}
        else if(ca?.exact&&cb?.exact&&ca.key===cb.key&&ca.allowed.length&&cb.allowed.length){
          if(subset(ca.allowed,cb.allowed)){remove=g.logic==='AND'?b:a;keep=remove===a?b:a;}
          else if(subset(cb.allowed,ca.allowed)){remove=g.logic==='AND'?a:b;keep=remove===a?b:a;}
        }
        if(remove&&keep){already.add(remove.at.condition);add({severity:'suggestion',section:side,title:duplicate?'Repeated condition':'A condition adds no extra filtering',
          explanation:duplicate?`${location(remove)} repeats ${location(keep)}.`:`With ${g.logic} logic, ${location(keep)} already covers the effect of ${location(remove)}.`,
          recommendation:'Remove the redundant condition to make the rule easier to read. Its true/false result stays the same.',locations:[keep.at,remove.at],
          fix:{kind:'remove-condition',label:'Preview simplification',location:remove.at,expectedCondition:remove.c}});}
      }
      for(const ref of refs){const c=constraint(ref.c);
        if(c?.exact&&c.allowed.length&&subset(c.domain,c.allowed))add({severity:'warning',section:side,title:'This condition does not filter available values',explanation:`${location(ref)} is always true when its measurement is available. It still rejects missing data.`,recommendation:'Choose a meaningful threshold if you intended to narrow the stock selection.',locations:[ref.at]});
      }
    }
    const cadence=rule.cadence==='daily'?375:Number.parseInt(rule.cadence??'0'),frames:Record<string,number>={'1m':1,'5m':5,'15m':15,'4h':240};
    const missed=rule.groups.flatMap((g,group)=>g.conditions.flatMap((c,condition)=>c.operator.startsWith('cross')&&(c.lookback??1)===1&&frames[c.leftFrame]<cadence?[{side,group,condition}]:[]));
    if(missed.length)add({severity:'warning',section:'setup',title:'Some crossings can occur between checks',explanation:`${sideName(side)} rules use a shorter candle than the strategy’s check frequency. Only the latest completed candle is checked; a crossing between checks can be missed.`,recommendation:'Review the check frequency in Setup or intentionally widen the crossover occurrence window.',locations:missed});
  }
  const entry=expanded.get('entry'),exit=expanded.get('exit');
  if(entry?.complete&&exit?.complete&&!issues.some(i=>i.severity==='error')){
    let overlap=false;
    if(entry.rows.length*exit.rows.length<=1024)for(const a of entry.rows)for(const b of exit.rows){
      const combined=examine([...a,...b]),ea=examine(a),eb=examine(b);
      const shared=[...ea.values.keys()].some(k=>eb.values.has(k));
      const same=a.length===b.length&&a.map(r=>signature(r.c)).sort().join('|')===b.map(r=>signature(r.c)).sort().join('|');
      if(!combined.impossible&&(same||combined.exact&&shared)){overlap=true;break;}
    }else limitations.push('Buy/sell overlap was not fully checked because there are too many alternative combinations.');
    if(overlap)add({severity:'warning',section:'exit',title:'Buy and sell conditions may overlap',explanation:'At least one buy path and one sell path can accept the same values. Buy checks apply when flat and sell checks when holding, so an entry could be followed by an exit while those conditions persist.',recommendation:'Review the sell threshold or timeframe if you intend to hold through this situation, then compare the backtest trade count and costs.',locations:[]});
  }
  const risk=draft.risk;
  if(risk){
    const exposure=Number((risk.riskPercent*risk.maxPositions).toFixed(2));
    positives.push(`Position sizing uses ${risk.riskPercent}% planned risk per trade and at most ${risk.maxPositions} positions.`);
    positives.push(`Combined planned stop risk is approximately ${exposure}% at full capacity (${risk.maxPositions} × ${risk.riskPercent}%). Gaps and costs can increase the loss.`);
    positives.push(rules.exit.enabled===false?'The exit plan explicitly uses protective stops and targets.':'Sell conditions and protective stops/targets are configured separately.');
    if(risk.exitTargets?.length)positives.push(`${risk.exitTargets.length} profit targets divide the original position; the final target closes the remaining shares.`);
    if(!risk.overnight)positives.push('Intraday square-off is enabled; actual fills still require available market data.');
    if(risk.overnight && ((risk.maxStopPercent??Infinity)<=3 || ['fixed','trailing'].includes(risk.stopMode)&&risk.stopPercent<=3))add({severity:'warning',section:'risk',title:'Tight stop for an overnight strategy',explanation:'A stop within 3% may exit during normal daily price movement, even when the weekly trend remains intact.',recommendation:'Review stop-out frequency, ATR and holding periods. A maximum stop cap skips entries with wider risk; it does not guarantee a long holding period.',locations:[]});
    const first=risk.exitTargets?.[0],fixed=risk.stopMode==='fixed'||risk.stopMode==='trailing';
    const targetPercent=first?(first.basis??'percent')==='percent'?first.profitPercent:fixed&&first.basis==='risk'?(first.value??0)*risk.stopPercent:undefined:fixed?risk.targetR*risk.stopPercent:undefined;
    const friction=2*((risk.costModel==='indian-cash'?(risk.overnight?0.12:0.05):risk.feePercent)+risk.slippagePercent);
    if(targetPercent!=null&&targetPercent<=friction)add({severity:'warning',section:'risk',title:'The first target may be consumed by trading costs',explanation:`The first planned gain is ${targetPercent.toFixed(2)}%; configured fees plus slippage total roughly ${friction.toFixed(2)}% across entry and exit.`,recommendation:'Review these assumptions and inspect net P&L in a backtest before choosing a target.',locations:[]});
  }
  if(!issues.some(i=>i.severity==='error'))positives.unshift('No impossible combination was proven by the supported logic checks.');
  limitations.push('This checks rule structure, not profitability or current data coverage. Different timeframes and offsets remain separate. Complex indicator relationships, pattern interactions and market regimes still need backtesting.');
  return {fingerprint:createHash('sha256').update(JSON.stringify(draft)).digest('hex'),issues,positives,limitations,blocked:issues.some(i=>i.severity==='error')};
}
