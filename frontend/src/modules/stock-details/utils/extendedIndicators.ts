import type { ChartBar } from '../types';
import { bucketTime, istDay } from './chartTime';
import type { CalculationSettings, IndicatorKind, PriceSource } from './indicatorCatalog';
type Values = (number | null)[];
export const price = (b: ChartBar, s: PriceSource = 'close') => s === 'hl2' ? (b.high+b.low)/2 : s === 'hlc3' ? (b.high+b.low+b.close)/3 : s === 'ohlc4' ? (b.open+b.high+b.low+b.close)/4 : b[s];
export function rolling(v: Values, n: number, fn: (x: number[]) => number): Values {
  return v.map((_,i) => { const w=v.slice(i-n+1,i+1); return i<n-1 || w.some(x=>x===null) ? null : fn(w as number[]); });
}
export function smooth(v: Values, n: number, wilder = false): Values {
  let count=0, last=0;
  return v.map(x=>{ if(x===null) return null; count++; last=wilder ? count<=n ? last+x/n : last+(x-last)/n : count===1 ? x : last+(x-last)*2/(n+1); return count>=n?last:null; });
}
export const sma=(v:Values,n:number)=>rolling(v,n,w=>w.reduce((a,b)=>a+b,0)/n);
export function average(v: Values, n: number, type = 'sma', volume: number[] = []): Values {
  if(type==='ema')return smooth(v,n);
  if(type==='dema'){const first=smooth(v,n),second=smooth(first,n);return second.map((x,i)=>x===null?null:2*first[i]!-x);}
  if(type==='wma')return rolling(v,n,w=>w.reduce((a,b,i)=>a+b*(i+1),0)/(n*(n+1)/2));
  if(type==='vwma'){const sums=sma(v.map((x,i)=>x===null?null:x*volume[i]),n),vol=sma(volume,n);return sums.map((x,i)=>x===null||!vol[i]?null:x/vol[i]!);}
  if(type==='hma'){const half=average(v,Math.max(1,Math.floor(n/2)),'wma'),full=average(v,n,'wma');return average(full.map((x,i)=>x===null||half[i]===null?null:2*half[i]!-x),Math.max(1,Math.floor(Math.sqrt(n))),'wma');}
  return sma(v,n);
}
export function rsi(v:Values,n:number):Values{const d=v.map((x,i)=>!i||x===null||v[i-1]===null?null:x-v[i-1]!);const up=smooth(d.map(x=>x===null?null:Math.max(0,x)),n,true),down=smooth(d.map(x=>x===null?null:Math.max(0,-x)),n,true);return up.map((x,i)=>x===null||down[i]===null?null:x+down[i]!==0?down[i]===0?100:100-100/(1+x/down[i]!):50);}
export const trueRanges=(b:ChartBar[])=>b.map((x,i)=>Math.max(x.high-x.low,i?Math.abs(x.high-b[i-1].close):0,i?Math.abs(x.low-b[i-1].close):0));
export function extendedValues(b: ChartBar[], kind: IndicatorKind, n: number, s: CalculationSettings): Values[] | undefined {
  const v=b.map(x=>price(x,s.source)),volume=b.map(x=>x.volume),hlc=b.map(x=>price(x,'hlc3'));
  const band=(mid:Values,width:Values):Values[]=>[mid.map((x,i)=>x===null||width[i]===null?null:x+width[i]!),mid,mid.map((x,i)=>x===null||width[i]===null?null:x-width[i]!)];
  if(['wma','vwma','hma','dema'].includes(kind))return [average(v,n,kind,volume)];
  if(kind==='averagePrice')return [b.map(x=>price(x,s.source??'ohlc4'))];
  if(kind==='maCross')return [average(v,s.fastPeriod??9,s.maType??'ema',volume),average(v,s.slowPeriod??21,s.maType??'ema',volume)];
  if(kind==='connorsRsi'){
    let streak=0;
    const close=b.map(x=>x.close),streaks=close.map((x,i)=>{streak=!i||x===close[i-1]?0:x>close[i-1]?Math.max(0,streak)+1:Math.min(0,streak)-1;return streak;});
    const priceRsi=rsi(close,n),streakRsi=rsi(streaks,s.streakPeriod??2),lookback=s.rankPeriod??100;
    const returns=close.map((x,i)=>!i||close[i-1]===0?null:100*(x/close[i-1]-1));
    return [returns.map((x,i)=>{
      const previous=returns.slice(i-lookback,i);
      if(x===null||i<lookback+1||previous.some(v=>v===null)||priceRsi[i]===null||streakRsi[i]===null)return null;
      return (priceRsi[i]!+streakRsi[i]!+100*previous.filter(v=>v!<x).length/lookback)/3;
    })];
  }
  if(kind==='donchian'){const hi=rolling(b.map(x=>x.high),n,w=>Math.max(...w)),lo=rolling(b.map(x=>x.low),n,w=>Math.min(...w));return [hi,hi.map((x,i)=>x===null?null:(x+lo[i]!)/2),lo];}
  if(kind==='keltner'||kind==='atrBands'){const mid=kind==='keltner'?smooth(v,n):v,atr=smooth(trueRanges(b),kind==='keltner'?(s.atrPeriod??10):n,true);return band(mid,atr.map(x=>x===null?null:x*(s.multiplier??2)));}
  if(kind==='roc'||kind==='momentum')return [v.map((x,i)=>i<n||!v[i-n]?null:kind==='roc'?(x/v[i-n]-1)*100:x-v[i-n])];
  if(kind==='cci'){const p=b.map(x=>price(x,s.source??'hlc3'));return [rolling(p,n,w=>{const m=w.reduce((a,c)=>a+c,0)/n,dev=w.reduce((a,c)=>a+Math.abs(c-m),0)/n;return dev?(w[n-1]-m)/(.015*dev):0;})];}
  if(kind==='stochastic'||kind==='stochRsi'||kind==='williamsR'){
    const base=kind==='stochRsi'?rsi(v,n):v,period=kind==='stochRsi'?(s.stochPeriod??14):n;
    const hi=rolling(kind==='stochRsi'?base:b.map(x=>x.high),period,w=>Math.max(...w)),lo=rolling(kind==='stochRsi'?base:b.map(x=>x.low),period,w=>Math.min(...w));
    const raw=base.map((x,i)=>x===null||hi[i]===null||lo[i]===null||hi[i]===lo[i]?null:100*(x-lo[i]!)/(hi[i]!-lo[i]!));
    if(kind==='williamsR')return [raw.map(x=>x===null?null:x-100)];
    const k=sma(raw,s.smoothK??3);return [k,sma(k,s.dPeriod??3)];
  }
  if(kind==='mfi'){const positive=sma(hlc.map((x,i)=>!i?null:x>hlc[i-1]?x*volume[i]:0),n),negative=sma(hlc.map((x,i)=>!i?null:x<hlc[i-1]?x*volume[i]:0),n);return [positive.map((x,i)=>x===null||negative[i]===null?null:(x+negative[i]!)===0?null:negative[i]===0?100:100-100/(1+x/negative[i]!))];}
  if(kind==='obv'){let total=0;const values=b.map((x,i)=>total+=!i?x.volume:x.close>b[i-1].close?x.volume:x.close<b[i-1].close?-x.volume:0);return (s.maPeriod??0)>0?[values,sma(values,s.maPeriod!)]:[values];}
  if(kind==='cmf'){const flow=sma(b.map(x=>x.high===x.low?0:(2*x.close-x.high-x.low)/(x.high-x.low)*x.volume),n),vol=sma(volume,n);return [flow.map((x,i)=>x===null||!vol[i]?null:x/vol[i]!)];}
  if(kind==='aroon'){return [rolling(b.map(x=>x.high),n+1,w=>100*w.lastIndexOf(Math.max(...w))/n),rolling(b.map(x=>x.low),n+1,w=>100*w.lastIndexOf(Math.min(...w))/n)];}
  if(kind==='choppiness'){const tr=sma(trueRanges(b),n),hi=rolling(b.map(x=>x.high),n,w=>Math.max(...w)),lo=rolling(b.map(x=>x.low),n,w=>Math.min(...w));return [tr.map((x,i)=>x===null||hi[i]===lo[i]||x<=0?null:100*Math.log10(x*n/(hi[i]!-lo[i]!))/Math.log10(n))];}
  if(kind==='ichimoku'){const mid=(period:number)=>{const hi=rolling(b.map(x=>x.high),period,w=>Math.max(...w)),lo=rolling(b.map(x=>x.low),period,w=>Math.min(...w));return hi.map((x,i)=>x===null?null:(x+lo[i]!)/2);};const conversion=mid(s.conversionPeriod??9),base=mid(s.basePeriod??26),span=mid(s.spanPeriod??52),a=base.map((x,i)=>x===null||conversion[i]===null?null:(x+conversion[i]!)/2),shift=s.displacement??26;return [conversion,base,a.map((_,i)=>i<shift?null:a[i-shift]),span.map((_,i)=>i<shift?null:span[i-shift]),v.map((_,i)=>v[i+shift]??null)];}
  if(kind==='sar'){
    const out:Values=Array(b.length).fill(null);if(b.length<2)return [out];let up=b[1].close>=b[0].close,ep=up?b[1].high:b[1].low,af=s.start??.02,sar=up?b[0].low:b[0].high;
    for(let i=1;i<b.length;i++){const bar=b[i];if(i>1){sar+=af*(ep-sar);sar=up?Math.min(sar,b[i-1].low,b[i-2].low):Math.max(sar,b[i-1].high,b[i-2].high);}
      if(up?bar.low<sar:bar.high>sar){sar=ep;up=!up;ep=up?bar.high:bar.low;af=s.start??.02;}else{const extreme=up?bar.high>ep:bar.low<ep;if(extreme){ep=up?bar.high:bar.low;af=Math.min(s.maximum??.2,af+(s.increment??.02));}}out[i]=sar;
    }return [out];
  }
  if(kind==='pivots'){
    let key='',high=0,low=0,close=0,levels:number[]|undefined;const result:Values[]=Array.from({length:7},()=>[]);
    for(const bar of b){const k=s.pivotFrame==='1w'?bucketTime(Date.parse(bar.time),'1w'):s.pivotFrame==='1d'?istDay(Date.parse(bar.time)):bucketTime(Date.parse(bar.time),'1mo');
      if(k!==key){if(key){const p=(high+low+close)/3,r=high-low;levels=s.pivotType==='fibonacci'?[p,p+.382*r,p-.382*r,p+.618*r,p-.618*r,p+r,p-r]:s.pivotType==='camarilla'?[p,close+1.1*r/12,close-1.1*r/12,close+1.1*r/6,close-1.1*r/6,close+1.1*r/4,close-1.1*r/4]:[p,2*p-low,2*p-high,p+r,p-r,2*p+high-2*low,2*p-2*high+low];}key=k;high=bar.high;low=bar.low;}else{high=Math.max(high,bar.high);low=Math.min(low,bar.low);}close=bar.close;result.forEach((row,j)=>row.push(levels?.[j]??null));
    }return result;
  }
  return undefined;
}
