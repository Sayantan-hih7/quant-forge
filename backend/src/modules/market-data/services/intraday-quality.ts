import { marketTime } from '../../../shared/market-calendar.js';
export interface MinuteRow { time: string; volume?: number }
export interface SessionQuality {
  date: string; observed: number; tradedMinutes: number; zeroVolumeMinutes: number;
  leading: number; internal: number; trailing: number; missing: number; noCandles: boolean; hasExitTrade: boolean;
}
/** Missing observations are not proof of missing trades. Never synthesize prices here. */
export function intradaySessions(rows: MinuteRow[], from: string, to: string): SessionQuality[] {
  const start=Date.parse(from), end=Date.parse(to), days=new Map<string,Map<number,MinuteRow>>();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
  for(const row of rows){
    const at=Date.parse(row.time);if(!Number.isFinite(at)||at<start||at+60000>end)continue;
    const date=new Date(at+19800000).toISOString().slice(0,10), open=Date.parse(date+'T09:15:00+05:30');
    if(at<open||at>=open+375*60000||(at-open)%60000)continue;
    const day=days.get(date)??new Map();day.set(at,row);days.set(date,day);
  }
  // A day with no rows must not disappear from the audit. Unknown calendar years
  // retain observed sessions only, rather than guessing holidays/listing history.
  const first=new Date(start+19800000).toISOString().slice(0,10);
  for(let at=Date.parse(first+'T09:15:00+05:30');at+375*60000<=end;at+=86400000){
    const clock=marketTime(at);if(at>=start&&clock.tradingDay&&!days.has(clock.date))days.set(clock.date,new Map());
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).flatMap(([date,minutes])=>{
    const open=Date.parse(date+'T09:15:00+05:30'),close=open+375*60000;
    if(start>open||end<close)return [];
    const indexes=[...minutes.keys()].map(at=>(at-open)/60000).sort((a,b)=>a-b);
    const noCandles=!indexes.length,leading=noCandles?0:indexes[0],trailing=noCandles?0:374-indexes.at(-1)!;
    const missing=375-minutes.size,internal=noCandles?0:missing-leading-trailing;
    return [{date,observed:minutes.size,tradedMinutes:[...minutes.values()].filter(row=>(row.volume??0)>0).length,
      zeroVolumeMinutes:[...minutes.values()].filter(row=>row.volume===0).length,leading,internal,trailing,missing,noCandles,
      hasExitTrade:[...minutes].some(([at,row])=>at>=close-15*60000&&(row.volume===undefined||row.volume>0))}];
  });
}
