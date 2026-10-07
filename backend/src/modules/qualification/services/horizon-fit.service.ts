import { storedCandles } from '../../market-data/repository.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { intradaySessions } from '../../market-data/services/intraday-quality.js';
import type { Candle,Fact } from '../../market-data/types.js';
import { assessHorizonFit, type StockFit } from './horizon-fit.js';
let cache:{key:string;until:number;pending:Promise<Map<string,{daily:Candle[];activity:{value:number|null;asOf?:string;reason?:string}}>>}|undefined;
export function completedSessions(now:number){
  const out:string[]=[],today=marketTime(now).date;
  for(let at=Date.parse(today+'T15:30:00+05:30');out.length<5&&at>now-30*86400000;at-=86400000){
    if(at<=now&&marketTime(at).tradingDay)out.push(marketTime(at).date);
  }
  return out.reverse();
}
export async function horizonFits(ids:string[],observations:Fact[],now=Date.now()):Promise<Map<string,StockFit>> {
  if(!ids.length)return new Map();
  const sessions=completedSessions(now),last=sessions.at(-1)??'',key=JSON.stringify([[...ids].sort(),sessions]);
  if(!cache||cache.key!==key||cache.until<now){
    const pending=(async()=>{
      const from=new Date(now-730*86400000).toISOString(),to=last+'T10:00:00.000Z';
      const [daily,minutes]=await Promise.all([
        storedCandles.aggregate<{_id:string;bars:Candle[]}>([
          {$match:{instrumentId:{$in:ids},interval:'1d',time:{$gte:from,$lt:to}}},
          {$sort:{instrumentId:1,time:-1}},{$group:{_id:'$instrumentId',bars:{$firstN:{n:260,input:'$$ROOT'}}}},
        ]),
        sessions.length?storedCandles.find({instrumentId:{$in:ids},interval:'1m',time:{$gte:sessions[0]+'T03:45:00.000Z',$lt:to}}).select('instrumentId time volume -_id').lean():[],
      ]);
      const grouped=new Map<string,typeof minutes>();for(const row of minutes){const group=grouped.get(row.instrumentId)??[];group.push(row);grouped.set(row.instrumentId,group);}
      return new Map(ids.map(id=>{
        const days=intradaySessions(grouped.get(id)??[],sessions[0]+'T00:00:00+05:30',to);
        const ready=sessions.length===5&&sessions.every(date=>days.some(day=>day.date===date&&day.observed>0));
        return [id,{daily:daily.find(row=>row._id===id)?.bars??[],activity:{value:ready?days.reduce((sum,d)=>sum+d.tradedMinutes,0)/(5*375)*100:null,asOf:last,
          reason:ready?undefined:'Five recent sessions of minute history are needed to assess trading activity'}}];
      }));
    })();
    cache={key,until:now+60000,pending};pending.catch(()=>{if(cache?.pending===pending)cache=undefined;});
  }
  const inputs=await cache.pending,result=new Map<string,StockFit>();
  for(const id of ids){const input=inputs.get(id)!;result.set(id,assessHorizonFit(input.daily,observations.filter(f=>f.instrumentId===id),input.activity,last,new Date(now).toISOString()));}
  return result;
}
