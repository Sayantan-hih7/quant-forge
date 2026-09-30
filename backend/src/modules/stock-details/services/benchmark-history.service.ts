import { parse } from 'csv-parse/sync';
import { download } from '../../../shared/http-client.js';
import { invariant, AppError } from '../../../shared/errors.js';
import { redis } from '../../../shared/redis.js';
import { DHAN_MASTER_URL } from '../../market-data/sources/dhan-master.js';
import { historyWindows, parseDhanHistory } from '../../market-data/sources/dhan-history.js';
import { CandleModel } from '../../market-data/models/market-data.model.js';
import { dhanRequest } from '../../connections/services/dhan.service.js';
import { aggregateBars } from '../utils/chart-bars.js';
import type { Instrument } from '../../market-data/types.js';

const names=['NIFTY 50','NIFTY BANK','SENSEX'] as const;
export type BenchmarkName=typeof names[number];
const pending=new Map<string,Promise<unknown>>();
async function securities() {
  const key='quantforge:benchmark:securities',stored=await redis.get(key);
  if(stored)return JSON.parse(stored) as Record<string,string>;
  const rows=parse((await download(DHAN_MASTER_URL)).toString('utf8'),{columns:true,bom:true,trim:true,skip_empty_lines:true}) as Record<string,string>[];
  const result:Record<string,string>={};
  for(const name of names){const matches=rows.filter(r=>r.INSTRUMENT==='INDEX'&&r.SEGMENT==='I'&&[r.UNDERLYING_SYMBOL,r.SYMBOL_NAME,r.DISPLAY_NAME].some(v=>v?.toUpperCase()===name));const ids=[...new Set(matches.map(r=>r.SECURITY_ID).filter(v=>/^\d+$/.test(v)))];if(ids.length===1)result[name]=ids[0];}
  invariant(Object.keys(result).length,'Benchmark indices could not be identified in the Dhan master');await redis.set(key,JSON.stringify(result),'EX',86400);return result;
}
/** Public chart benchmark data uses broker history, never the current index quote as a historical substitute. */
export async function benchmarkHistory(name:BenchmarkName,frame:'1d'|'1w'|'1mo',from:string,at?:string) {
  const now=at?Math.min(Date.now(),Date.parse(at)):Date.now(),to=new Date(now+86400000+19800000).toISOString().slice(0,10),id=`benchmark:${name}`;
  let message:string|undefined;
  try{
    const securityId=(await securities())[name];invariant(securityId,`${name} historical identifier is unavailable`);
    const stock:Instrument={_id:id,securityId,exchange:name==='SENSEX'?'BSE':'NSE',isin:'',symbol:name,name,series:'INDEX',lotSize:1,active:true,primary:false,observedAt:new Date().toISOString()};
    for(const window of historyWindows(from,to,'1d')){
      const key=`quantforge:benchmark:history:${name}:${window.from}:${window.to}`;
      if(await redis.exists(key))continue;
      let job=pending.get(key);
      if(!job){job=(async()=>{const response=await dhanRequest('/charts/historical',{securityId,exchangeSegment:'IDX_I',instrument:'INDEX',expiryCode:0,oi:false,fromDate:window.from,toDate:window.to},{maxWaitMs:30000});
        const rows=parseDhanHistory(response,stock,'1d',new Date(now).toISOString());
        if(rows.length)await CandleModel.bulkWrite(rows.map(row=>({updateOne:{filter:{instrumentId:id,interval:'1d',time:row.time},update:{$set:row},upsert:true}})));
        await redis.set(key,'1','EX',window.to===to?300:86400);
      })().finally(()=>pending.delete(key));pending.set(key,job);}await job;
    }
  }catch(e){message=e instanceof AppError?e.message:'Benchmark history could not be refreshed';}
  const rows=await CandleModel.find({instrumentId:id,interval:'1d',time:{$gte:`${from}T00:00:00.000Z`,$lte:new Date(now).toISOString()}}).sort({time:1}).select('time open high low close volume -_id').lean();
  return {instrumentId:id,timeframe:frame,bars:aggregateBars(rows,frame),message,source:'Dhan benchmark history',requestedFrom:from,historyVerified:!message};
}
