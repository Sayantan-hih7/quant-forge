import type { ChartBar } from '../types';
import { indicatorValues } from './chartIndicators';
import { barEnd } from './chartTime';
import { pivotLevels } from './pivotPoints';

export type Verdict='bullish'|'bearish'|'neutral'|'unavailable';
export const dailyResearchPath=(id:string)=>`/stocks/${encodeURIComponent(id)}/chart?timeframe=1d&minBars=300&lookbackDays=400`;
export interface TechnicalReading { name:string; value:number|null; verdict:Verdict; explanation:string; directional:boolean }
export function technicalSummary(input:ChartBar[],now=Date.now()) {
  const bars=input.filter(b=>barEnd(b.time,'1d')<=now).sort((a,b)=>a.time.localeCompare(b.time));
  const close=bars.at(-1)?.close;
  const latest=(kind:Parameters<typeof indicatorValues>[1],n:number,line=0)=>indicatorValues(bars,kind,n)[line]?.at(-1)??null;
  const compare=(value:number|null,reference:number|undefined|null):Verdict=>value===null||reference==null?'unavailable':value>reference?'bullish':value<reference?'bearish':'neutral';
  const rows:TechnicalReading[]=[...([20,50,200] as const).map(n=>{const v=latest('sma',n);return {name:`SMA ${n}`,value:v,verdict:compare(close??null,v),directional:true,explanation:`Bullish when the completed daily close is above SMA ${n}; bearish below it.`};}),
    {name:'EMA 21',value:latest('ema',21),verdict:compare(close??null,latest('ema',21)),directional:true,explanation:'Bullish when the completed daily close is above EMA 21; bearish below it.'}];
  const rsi=latest('rsi',14),macd=latest('macd',12,2);
  rows.push({name:'RSI 14',value:rsi,verdict:rsi===null?'unavailable':rsi>55?'bullish':rsi<45?'bearish':'neutral',directional:true,explanation:'Momentum reading: above 55 bullish, below 45 bearish, otherwise neutral. An extreme RSI is not a standalone buy/sell instruction.'},
    {name:'MACD histogram (12,26,9)',value:macd,verdict:compare(macd,0),directional:true,explanation:'MACD minus its signal line. Positive is bullish momentum; negative is bearish momentum.'},
    {name:'ADX 14',value:latest('adx',14),verdict:latest('adx',14)===null?'unavailable':'neutral',directional:false,explanation:'Trend strength, not direction. ADX above 25 indicates a stronger trend; it does not count towards the bullish/bearish summary.'},
    {name:'ATR 14',value:latest('atr',14),verdict:latest('atr',14)===null?'unavailable':'neutral',directional:false,explanation:'Average true range in rupees per share. Measures price movement, not direction; excluded from the summary.'});
  const directional=rows.filter(r=>r.directional),available=directional.filter(r=>r.verdict!=='unavailable');
  const bullish=available.filter(r=>r.verdict==='bullish').length,bearish=available.filter(r=>r.verdict==='bearish').length,neutral=available.length-bullish-bearish;
  const verdict:Verdict=!available.length?'unavailable':bullish>bearish?'bullish':bearish>bullish?'bearish':'neutral';
  const last=bars.at(-1);
  return {rows,bullish,bearish,neutral,available:available.length,total:directional.length,verdict,asOf:last?.time,close,
    pivots:last?pivotLevels(last.high,last.low,last.close):null};
}
export function observedRange(input:ChartBar[],now=Date.now()){
  const from=new Date(now-364*86400000).toISOString().slice(0,10);
  const bars=input.filter(b=>b.time.slice(0,10)>=from&&barEnd(b.time,'1d')<=now);
  return bars.length?{low:Math.min(...bars.map(b=>b.low)),high:Math.max(...bars.map(b=>b.high)),from:bars[0].time,to:bars.at(-1)!.time,count:bars.length}:undefined;
}
