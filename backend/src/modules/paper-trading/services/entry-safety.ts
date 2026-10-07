import {squareOffMinute,executionCloseMinute} from './execution-session.js';
/** A completed candle cannot cause a new entry after a later exit. */
export function entryAfterExit(barEnd:string,latestExit?:string|null){
 const bar=Date.parse(barEnd),exit=latestExit?Date.parse(latestExit):null;
 return Number.isFinite(bar)&&(exit===null||Number.isFinite(exit)&&bar>exit);
}
export function entryCutoffMinute(risk:{overnight:boolean;entryCutoffMinute?:number},id?:string,now=Date.now()){
 return risk.overnight?(id?executionCloseMinute(id,now):930):Math.min(risk.entryCutoffMinute??915,id?squareOffMinute(id,now):915);
}

/** Calendar time in IST; filled buys count, rejected attempts do not. */
export function reentryBlock(risk:{reentryCooldownMinutes?:number;maxEntriesPerStockPerDay?:number},at:string,latestExit:string|undefined|null,buyTimes:string[]){
 const now=Date.parse(at),exit=latestExit?Date.parse(latestExit):NaN;
 const cooldown=risk.reentryCooldownMinutes??0;
 if(cooldown>0&&Number.isFinite(exit)&&now<exit+cooldown*60000)return `Entry cooldown: wait ${cooldown} minutes after the last full exit.`;
 const day=(time:number)=>new Date(time+19800000).toISOString().slice(0,10);
 const maximum=risk.maxEntriesPerStockPerDay??0;
 if(maximum>0&&buyTimes.filter(t=>Number.isFinite(Date.parse(t))&&day(Date.parse(t))===day(now)).length>=maximum)return `Daily entry limit: ${maximum} filled buys for this stock.`;
 return undefined;
}
