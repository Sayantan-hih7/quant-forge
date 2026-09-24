import { randomUUID } from 'node:crypto';
import { onShutdown } from './shared/shutdown.js';
import { connectDatabase, disconnectDatabase } from './shared/database.js';
import { redis,jobs } from './shared/redis.js';
import { PAPER_HEARTBEAT } from './modules/paper-trading/services/paper.service.js';
import { processPaperOrders,evaluatePaperStrategies } from './modules/paper-trading/services/runner.service.js';
await connectDatabase();
const owner=randomUUID(),lease='quantforge:paper:lease';
if(!await redis.set(lease,owner,'PX',30000,'NX'))throw new Error('Another paper worker is running');
let stopping=false,busy=false,evaluating=false,lastEvaluation=0;
const timer=setInterval(()=>{if(stopping||busy)return;busy=true;void cycle().catch(()=>console.error('Paper worker cycle unavailable; no unchecked fills submitted.')).finally(()=>{busy=false;});},1000);
async function cycle(){
  if(!await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],30000) else return 0 end",1,lease,owner)){stopping=true;clearInterval(timer);throw new Error('Paper ownership lost');}
  await processPaperOrders();await redis.set(PAPER_HEARTBEAT,new Date().toISOString(),'EX',10);
  if(!evaluating && Date.now()-lastEvaluation>10000){evaluating=true;lastEvaluation=Date.now();void evaluatePaperStrategies().catch(()=>{}).finally(()=>{evaluating=false;});}
}
async function stop(){stopping=true;clearInterval(timer);while(busy||evaluating)await new Promise(r=>setTimeout(r,100));await redis.del(PAPER_HEARTBEAT);await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lease,owner);await jobs.close();await redis.quit();await disconnectDatabase();}
onShutdown(stop);
console.log('QuantForge paper worker started. Broker order submission is unavailable.');
