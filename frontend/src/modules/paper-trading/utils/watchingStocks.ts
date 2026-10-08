import type {PaperData} from '../hooks/useBackendPaper';
export function watchingStocks(data:PaperData,sessionId?:string){
 return data.sessions.filter(s=>s.active&&(!sessionId||s._id===sessionId)).flatMap(session=>{
  const ids=[...new Set([...(session.ids??session.scope?.selectedIds??[]),...(session.scope?.monitoredIds??[]),...data.positions.filter(p=>p.sessionId===session._id).map(p=>p.instrumentId)])];
  return ids.map(instrumentId=>{
   const observation=data.observations?.find(o=>o.sessionId===session._id&&o.instrumentId===instrumentId),held=data.positions.find(p=>p.sessionId===session._id&&p.instrumentId===instrumentId),order=data.orders.find(o=>o.sessionId===session._id&&o.instrumentId===instrumentId&&['pending','confirmation'].includes(o.status));
   let status='Waiting for buy conditions',kind='waiting';
   if(held)status='Holding: watching sell rules, SL and targets';
   if(observation?.entry.matched&&!held)status='Buy conditions met; execution checks still apply';
   if(!observation)status='Waiting for first completed-candle check';
   else if(!observation.current){status='Waiting for current candle history';kind='blocked';}
   else if((held?observation.exit:observation.entry).matched===null){status='Waiting for required rule data';kind='blocked';}
   if(!held&&session.scope?.excludedIds.includes(instrumentId)){status='Excluded from current qualification';kind='blocked';}
   if(!held&&(session.entriesPaused||data.safety?.halted)){status='New entries paused';kind='blocked';}
   if(data.marketOpen===false){status=held?'Market closed; held position remains open':session.entriesPaused||data.safety?.halted?'Market closed; new entries remain paused':'Market closed; waiting for next session';kind='closed';}
   else if(!data.workerRunning){status='Paper worker offline';kind='blocked';}
   else if(data.safety?.clock.state!=='ok'&&data.safety?.clock){status='Clock verification blocks execution';kind='blocked';}
   else if(!data.feed?.freshIds.includes(instrumentId)){status='Waiting for fresh live quote';kind='blocked';}
   if(order){status=`${order.side==='BUY'?'Buy':'Sell'} ${order.status==='confirmation'?'awaiting confirmation':'queued; waiting for eligible fill'}`;kind='order';if(data.marketOpen===false)status='Market closed; '+status;else if(!data.workerRunning)status='Worker offline; '+status;else if(!data.feed?.freshIds.includes(instrumentId))status='No fresh quote; '+status;}
   return {key:session._id+':'+instrumentId,instrumentId,symbol:data.symbols?.[instrumentId]??instrumentId,session,observation,held,order,status,kind};
  });
 });
}
