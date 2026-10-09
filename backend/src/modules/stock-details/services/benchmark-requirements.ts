import type { BenchmarkName } from './benchmark-history.service.js';
export function ruleBenchmarks(rules: Record<string,unknown>[], mode?: 'daily'|'intraday') {
  const names=new Set<BenchmarkName>();
  for(const rule of rules){if(rule.enabled===false)continue;for(const g of rule.groups as {conditions:Record<string,unknown>[]}[]??[])for(const c of g.conditions){
    for(const [field,settings,frame] of [[c.field??c.left,c.settings??c.leftSettings,c.timeframe??c.leftFrame??'1mo'],...(['field','indicator'].includes(String(c.operand??c.rightType))?[[c.compareField??c.right,c.compareSettings??c.rightSettings,c.compareTimeframe??c.rightFrame??'1mo']]:[])])
      if((!mode || (['1d','1w','1mo','1q'].includes(String(frame))?'daily':'intraday')===mode) && ['relativeStrength','benchmarkClose','benchmarkEma'].includes(String(field)))names.add(((settings as {benchmark?:BenchmarkName}|undefined)?.benchmark??'NIFTY 50'));
  }}return [...names];
}
