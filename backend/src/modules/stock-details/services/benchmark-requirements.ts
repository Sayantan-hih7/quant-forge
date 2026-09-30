import type { BenchmarkName } from './benchmark-history.service.js';
export function ruleBenchmarks(rules: Record<string,unknown>[]) {
  const names=new Set<BenchmarkName>();
  for(const rule of rules){if(rule.enabled===false)continue;for(const g of rule.groups as {conditions:Record<string,unknown>[]}[]??[])for(const c of g.conditions){
    for(const [field,settings] of [[c.field??c.left,c.settings??c.leftSettings],...(['field','indicator'].includes(String(c.operand??c.rightType))?[[c.compareField??c.right,c.compareSettings??c.rightSettings]]:[])])
      if(field==='relativeStrength')names.add(((settings as {benchmark?:BenchmarkName}|undefined)?.benchmark??'NIFTY 50'));
  }}return [...names];
}
