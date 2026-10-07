import type { Candle, Fact } from '../../market-data/types.js';
export type Horizon = 'intraday'|'swing'|'long-term';
export interface FitCheck { label:string; rule:string; value:number|null; unit:string; status:'pass'|'fail'|'unavailable'; asOf?:string; source?:string; reason?:string }
export interface HorizonFit { horizon:Horizon; label:string; status:'matched'|'not-matched'|'unavailable'; checks:FitCheck[] }
export interface StockFit { version:string; assessedAt:string; profiles:HorizonFit[] }
export function assessHorizonFit(rows:Pick<Candle,'time'|'open'|'high'|'low'|'close'|'volume'>[], facts:Fact[],
  activity:{value:number|null;asOf?:string;reason?:string}, expectedSession:string, now=new Date().toISOString()):StockFit {
  const bars=[...rows].filter(row=>row.time.slice(0,10)<=expectedSession).sort((a,b)=>a.time.localeCompare(b.time));
  const latest=bars.at(-1),date=latest?.time.slice(0,10),fresh=date===expectedSession;
  const average=(n:number,key:'close'|'volume')=>fresh&&bars.length>=n?bars.slice(-n).reduce((sum,row)=>sum+row[key],0)/n:null;
  const sma20=average(20,'close'),sma50=average(50,'close'),sma200=average(200,'close');
  const turnover=fresh&&bars.length>=20?bars.slice(-20).reduce((sum,row)=>sum+row.close*row.volume,0)/20/1e7:null;
  let atr:number|null=null;
  if(fresh&&bars.length>=15){
    const ranges=bars.map((b,i)=>Math.max(b.high-b.low,i?Math.abs(b.high-bars[i-1].close):0,i?Math.abs(b.low-bars[i-1].close):0));
    atr=ranges.slice(0,14).reduce((s,v)=>s+v,0)/14;
    for(const range of ranges.slice(14))atr=(atr*13+range)/14;
    atr=100*atr/latest!.close;
  }
  const check=(label:string,rule:string,value:number|null,unit:string,pass:(n:number)=>boolean,source='Stored daily candles',asOf=date,reason?:string):FitCheck=>
    ({label,rule,value:value!==null&&Number.isFinite(value)?value:null,unit,status:value===null||!Number.isFinite(value)?'unavailable':pass(value)?'pass':'fail',source,asOf,
      ...(value===null?{reason:reason??(!fresh?'Recent completed daily history is unavailable':'Not enough completed daily candles')}: {})});
  const factCheck=(field:string,label:string,rule:string,unit:string,pass:(n:number)=>boolean)=>{
    const fact=facts.find(f=>f.field===field&&f.knownAt<=now&&(!f.validUntil||f.validUntil>=now)&&typeof f.value==='number');
    return check(label,rule,fact&&typeof fact.value==='number'?fact.value:null,unit,pass,fact?.source??'Company reports',fact?.period??fact?.observedAt,'A current company fact is unavailable');
  };
  const liquidity=(threshold:number)=>check('20-day estimated daily turnover', 'At least INR '+threshold+' Cr',turnover,'INR Cr',v=>v>=threshold,'Daily close x volume (estimate)');
  const trend=(label:string,period:number,value:number|null)=>check(label,'Close above SMA '+period,fresh&&value!==null?100*(latest!.close/value-1):null,'%',v=>v>0);
  const definitions:[Horizon,string,FitCheck[]][]=[
    ['intraday','Intraday',[check('Last completed close','At least INR 20',fresh?latest!.close:null,'INR',v=>v>=20),liquidity(10),
      check('Daily ATR 14 / close','Between 1% and 8%',atr,'%',v=>v>=1&&v<=8),
      check('Minutes with trades, last 5 sessions','At least 80%',activity.value,'%',v=>v>=80,'Stored 1-minute volume',activity.asOf,activity.reason)]],
    ['swing','Swing / short-term',[liquidity(2),trend('50-day trend',50,sma50),
      check('20-day vs 50-day average','SMA 20 above SMA 50',sma20!==null&&sma50!==null?100*(sma20/sma50-1):null,'%',v=>v>0),
      check('Daily ATR 14 / close','At most 8%',atr,'%',v=>v<=8)]],
    ['long-term','Long-term',[trend('200-day trend',200,sma200),
      factCheck('marketCap','Market cap','At least INR 2,000 Cr','INR Cr',v=>v>=2000),
      factCheck('roe','Return on equity','At least 12%','%',v=>v>=12)]],
  ];
  return {version:'horizon-profiles-v1',assessedAt:now,profiles:definitions.map(([horizon,label,checks])=>({horizon,label,
    status:checks.some(c=>c.status==='unavailable')?'unavailable':checks.every(c=>c.status==='pass')?'matched':'not-matched',checks}))};
}
