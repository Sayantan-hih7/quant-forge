import { AppError } from '../../../shared/errors.js';
import type { Candle, Instrument } from '../types.js';
import { parseDhanHistory } from '../sources/dhan-history.js';
import { dhanRequest } from '../../connections/services/dhan.service.js';
export interface DailyWindow { from:string; to:string }
const validationFailure=(error:unknown)=>error instanceof AppError&&error.code==='INVALID_DATA'&&/Dhan (OHLCV candle|candles|candle|history)/.test(error.message);
export function monthlyWindows(from:string,to:string):DailyWindow[]{
 const out:DailyWindow[]=[];let cursor=from;
 while(cursor<to){const d=new Date(cursor),next=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString().slice(0,10),end=next<to?next:to;out.push({from:cursor,to:end});cursor=end;}
 return out;
}
/** An invalid year must not discard other valid months. Never choose between conflicting prices. */
export async function downloadDailyWindows(stock:Instrument,from:string,to:string,save:(window:DailyWindow,rows:Candle[])=>Promise<void>,
 options:{maxWaitMs?:number}={},request=dhanRequest,firstKnownDay?:string){
 let earliest=firstKnownDay;
 const failures:{from:string;to:string;message:string}[]=[];
 const fetchWindow=async(window:DailyWindow)=>{
  const requestTo=earliest&&window.to<=earliest?new Date(Date.parse(earliest)+86400000).toISOString().slice(0,10):window.to;
  const raw=await request('/charts/historical',{securityId:stock.securityId,exchangeSegment:stock.exchange+'_EQ',instrument:'EQUITY',oi:false,expiryCode:0,fromDate:window.from,toDate:requestTo},options);
  const rows=parseDhanHistory(raw,stock,'1d',new Date().toISOString()).filter(row=>row.time.slice(0,10)>=window.from&&row.time.slice(0,10)<window.to);
  if(rows.length&&(!earliest||rows[0].time.slice(0,10)<earliest))earliest=rows[0].time.slice(0,10);
  await save(window,rows);
 };
 const years:DailyWindow[]=[];let cursor=from;
 while(cursor<to){const next=String(new Date(cursor).getUTCFullYear()+1)+'-01-01',end=next<to?next:to;years.push({from:cursor,to:end});cursor=end;}
 for(const window of years.reverse()){
  try{await fetchWindow(window);}
  catch(error){
   if(!validationFailure(error))throw error;
   for(const month of monthlyWindows(window.from,window.to).reverse()){
    try{await fetchWindow(month);}
    catch(inner){if(!validationFailure(inner))throw inner;failures.push({...month,message:(inner as AppError).message});}
   }
  }
 }
 if(failures.length)throw new AppError(502,'DHAN_HISTORY_CONFLICT',failures.length+' history windows still contain invalid or conflicting Dhan candles ('+failures.slice(0,3).map(f=>f.from+' to '+f.to).join(', ')+'). Valid windows were saved; ambiguous candles were not used.');
}
