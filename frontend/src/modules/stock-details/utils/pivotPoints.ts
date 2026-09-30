import type { ChartBar } from '../types';
import type { CalculationSettings } from './indicatorCatalog';
import { bucketTime, istDay } from './chartTime';

export function pivotLevels(high:number,low:number,close:number,type='traditional') {
  const p=(high+low+close)/3,r=high-low;
  if(type==='fibonacci')return [p,p+.382*r,p-.382*r,p+.618*r,p-.618*r,p+r,p-r];
  if(type==='camarilla')return [p,close+1.1*r/12,close-1.1*r/12,close+1.1*r/6,close-1.1*r/6,close+1.1*r/4,close-1.1*r/4];
  return [p,2*p-low,2*p-high,p+r,p-r,2*p+high-2*low,2*p-2*high+low];
}
/** Select strictly earlier periods, so the current period cannot alter its own pivots. */
export function pivotPoints(source:ChartBar[],target:ChartBar[],settings:CalculationSettings) {
  const frame=settings.pivotFrame??'1mo',key=(t:string)=>frame==='1d'?istDay(Date.parse(t)):bucketTime(Date.parse(t),frame);
  const grouped=new Map<string,{high:number;low:number;close:number}>();
  for(const b of source){const k=key(b.time),old=grouped.get(k);grouped.set(k,{high:Math.max(old?.high??b.high,b.high),low:Math.min(old?.low??b.low,b.low),close:b.close});}
  const periods=[...grouped.keys()].sort();let cursor=-1;
  return target.map(b=>{const k=key(b.time);while(cursor+1<periods.length&&periods[cursor+1]<k)cursor++;if(cursor<0)return null;if(frame!=='1d'){const prior=new Date(`${k}T00:00:00Z`);if(frame==='1mo')prior.setUTCMonth(prior.getUTCMonth()-1);else prior.setUTCDate(prior.getUTCDate()-7);if(periods[cursor]!==prior.toISOString().slice(0,10))return null;}const previous=grouped.get(periods[cursor])!;return pivotLevels(previous.high,previous.low,previous.close,settings.pivotType);});
}
