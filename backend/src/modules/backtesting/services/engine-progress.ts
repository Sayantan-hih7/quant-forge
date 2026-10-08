import type { Readable } from 'node:stream';
import { AppError } from '../../../shared/errors.js';
export interface CalculationProgress { phase:string; processed?:number; total?:number; through?:string }
/** A heartbeat keeps an active calculation alive; missing heartbeats fail promptly. */
export async function readCalculation(stream:Readable, progress:(value:CalculationProgress)=>Promise<void>=async()=>{}, idleMs=60_000, maximumMs=2*60*60_000) {
 let buffer='', result:Record<string,unknown>|undefined;
 const decoder=new TextDecoder();
 const fail=(message:string)=>stream.destroy(new AppError(504,'ENGINE_TIMEOUT',message));
 const idle=setInterval(()=>{if(Date.now()-lastReceived>idleMs)fail('The calculation engine stopped sending progress. Stored history is retained; retry after checking engine services.');},Math.min(idleMs,5000));
 const maximum=setTimeout(()=>fail('This calculation exceeded the two-hour safety limit. Stored history is retained; reduce the scope before retrying.'),maximumMs);
 let lastReceived=Date.now();
 try {
  for await(const chunk of stream){
   lastReceived=Date.now();buffer+=decoder.decode(chunk as Uint8Array,{stream:true});
   if(buffer.length>64*1024*1024)throw new AppError(502,'ENGINE_PROTOCOL','Calculation response exceeded the supported size.');
   let end:number;
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
    const event=JSON.parse(line);
    if(event.type==='error')throw new AppError(event.code==='ENGINE_VALIDATION'?422:503,event.code??'ENGINE_CALCULATION',String(event.message??'Calculation failed').slice(0,1500));
    if(event.type==='progress')await progress(event);
    else if(event.type==='result'&&event.data&&typeof event.data==='object'&&!Array.isArray(event.data))result=event.data;
   }
  }
  if(!result||buffer.trim())throw new AppError(503,'ENGINE_DISCONNECTED','The engine connection ended before a complete report arrived. Stored history is retained for retry.');
  return result;
 } catch(error) {
  if(error instanceof AppError)throw error;
  throw new AppError(503,'ENGINE_DISCONNECTED','The calculation stream was interrupted or unreadable before the report completed. Stored history is retained for retry.');
 } finally {clearInterval(idle);clearTimeout(maximum);stream.destroy();}
}
