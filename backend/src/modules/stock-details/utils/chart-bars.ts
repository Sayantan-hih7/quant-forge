import type { ChartBar, StockTimeframe } from '../types.js';

export const indianDate = (time: number | string) => new Date((typeof time === 'number' ? time : Date.parse(time)) + 19_800_000).toISOString().slice(0, 10);
export function aggregateBars(bars: ChartBar[], frame: StockTimeframe): ChartBar[] {
  const groups = new Map<string, ChartBar>();
  for (const bar of [...bars].sort((a, b) => a.time.localeCompare(b.time))) {
    const day = indianDate(bar.time);
    let key: string;
    if (frame === '1mo') key = `${day.slice(0, 7)}-01`;
    else if (frame === '1w') {
      const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); key = d.toISOString().slice(0, 10);
    } else if (frame === '1d') key = day;
    else {
      const minutes = Number(frame.slice(0, -1)) * (frame.endsWith('h') ? 60 : 1);
      const sessionStart = Date.parse(`${day}T09:15:00+05:30`);
      key = new Date(sessionStart + Math.floor((Date.parse(bar.time) - sessionStart) / (minutes * 60_000)) * minutes * 60_000).toISOString();
    }
    const previous = groups.get(key);
    if (previous) { previous.high = Math.max(previous.high, bar.high); previous.low = Math.min(previous.low, bar.low); previous.close = bar.close; previous.volume += bar.volume; }
    else groups.set(key, { ...bar, time: key });
  }
  return [...groups.values()];
}

export interface IntradayGap { time: string; end: string; missingMinutes: string[] }
/** Inspect observed sessions; missing observations are not proof of missing trades. */
export function intradayGapDetails(rows: ChartBar[], frame: StockTimeframe, now: number): IntradayGap[] {
 const minutes=Number(frame.slice(0,-1))*(frame.endsWith('h')?60:1);
 if(!Number.isFinite(minutes)||minutes<=0)return [];
 const observed=new Set(rows.map(row=>Date.parse(row.time)));
 const missing:IntradayGap[]=[];
 for(const day of new Set(rows.map(row=>indianDate(row.time)))){
  const close=Date.parse(`${day}T10:00:00Z`);
  for(let start=Date.parse(`${day}T03:45:00Z`);start<Math.min(now,close);start+=minutes*60000){
   const end=Math.min(start+minutes*60000,close);
   if(end>now)break;
   const missingMinutes:string[]=[];
   for(let at=start;at<end;at+=60000)if(!observed.has(at))missingMinutes.push(new Date(at).toISOString());
   if(missingMinutes.length)missing.push({time:new Date(start).toISOString(),end:new Date(end).toISOString(),missingMinutes});
  }
 }
 return missing;
}
export function missingIntradayIntervals(rows: ChartBar[], frame: StockTimeframe, now: number): string[] {
 return intradayGapDetails(rows,frame,now).map(gap=>gap.time);
}
