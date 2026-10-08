import { checkProtectionAlerts } from './modules/paper-trading/services/protection-alerts.js';
import { refreshClockHealth } from './shared/clock-health.js';
import { randomUUID } from 'node:crypto';
import { onShutdown } from './shared/shutdown.js';
import { connectDatabase, disconnectDatabase } from './shared/database.js';
import { redis,jobs } from './shared/redis.js';
import { PAPER_HEARTBEAT } from './modules/paper-trading/services/paper.service.js';
import { processPaperOrders,evaluatePaperStrategies } from './modules/paper-trading/services/runner.service.js';
import { refreshPaperHistory, PAPER_HISTORY_STATUS } from './modules/paper-trading/services/history-refresh.service.js';
import { claimWorkerLease } from './shared/worker-lease.js';
await connectDatabase();
const owner=randomUUID(),lease='quantforge:paper:lease';
await claimWorkerLease(lease,owner,30000);
let stopping=false,busy=false,evaluating=false,refreshing=false,lastEvaluation=0,lastRefresh=0,renewing=false,lastLease=Date.now();
let closing:Promise<void>|undefined;
let clockSafe=false,lastClockCheck=0,lastProtectionCheck=0,checkingProtection=false;
const canContinue=()=>!stopping && clockSafe && Date.now()-lastClockCheck>=0 && Date.now()-lastClockCheck<60000 && Date.now()-lastLease<25000;
const leaseTimer=setInterval(()=>{
  if(stopping||renewing)return;
  renewing=true;
  void redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],30000) else return 0 end",1,lease,owner)
    .then(result=>{if(!result)throw new Error('Paper worker lease lost');lastLease=Date.now();})
    .catch(()=>{stopping=true;process.exitCode=1;void stop();}).finally(()=>{renewing=false;});
},5000);
let requested=false;
function requestCycle(){
  if(stopping)return;
  if(busy){requested=true;return;}
  busy=true;requested=false;
  void cycle().catch(()=>console.error('Paper worker cycle unavailable; no unchecked fills submitted.')).finally(()=>{
    busy=false;if(requested&&!stopping)setImmediate(requestCycle);
  });
}
const subscriber=redis.duplicate();subscriber.on('error',()=>{});
await subscriber.subscribe('quantforge:events');
subscriber.on('message',(_channel,payload)=>{
  try{const event=JSON.parse(payload);if(event.type==='paper.ticks'||event.type==='paper.orders')requestCycle();}catch{/* Ignore malformed wakeups; the clock remains a fallback. */}
});
const timer=setInterval(requestCycle,1000);
async function cycle(){
  if(stopping)return;
  if(Date.now()-lastClockCheck>30000||Date.now()<lastClockCheck){clockSafe=false;const clock=await refreshClockHealth();lastClockCheck=Date.now();clockSafe=clock.state==='ok';}
  await redis.set(PAPER_HEARTBEAT,new Date().toISOString(),'EX',10);
  await redis.set('quantforge:paper:exit-controls','1','EX',10);
  if(!checkingProtection&&Date.now()-lastProtectionCheck>15000){checkingProtection=true;lastProtectionCheck=Date.now();void checkProtectionAlerts(clockSafe).catch(()=>console.error('Paper protection alert check unavailable.')).finally(()=>{checkingProtection=false;});}
  if(!canContinue())return;
  await processPaperOrders(canContinue);if(!canContinue())return;await redis.set(PAPER_HEARTBEAT,new Date().toISOString(),'EX',10);
  await redis.set('quantforge:paper:exit-controls','1','EX',10);
  if(!evaluating && Date.now()-lastEvaluation>10000){evaluating=true;lastEvaluation=Date.now();void evaluatePaperStrategies(Date.now(),canContinue).catch(()=>{}).finally(()=>{evaluating=false;});}
  if(!refreshing && Date.now()-lastRefresh>30000){refreshing=true;lastRefresh=Date.now();void refreshPaperHistory(()=>stopping).catch(async()=>{await redis.set(PAPER_HISTORY_STATUS,JSON.stringify({state:'error',message:'History refresh unavailable. Existing data is retained; missing candles will be retried.',updatedAt:new Date().toISOString()})).catch(()=>{});}).finally(()=>{refreshing=false;});}
}
function stop(){return closing??=(async()=>{stopping=true;clearInterval(timer);clearInterval(leaseTimer);subscriber.disconnect();while(busy||evaluating||refreshing||renewing||checkingProtection)await new Promise(r=>setTimeout(r,100));await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1],KEYS[2]) else return 0 end",2,lease,PAPER_HEARTBEAT,owner);await jobs.close();await redis.quit();await disconnectDatabase();})();}
onShutdown(stop);
console.log('QuantForge paper worker started. Broker order submission is unavailable.');
