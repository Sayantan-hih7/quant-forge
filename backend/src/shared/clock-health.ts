import { createSocket } from 'node:dgram';
import { performance } from 'node:perf_hooks';
import { redis } from './redis.js';
export const CLOCK_KEY='quantforge:safety:clock';
export interface ClockHealth {state:'ok'|'blocked'|'unknown';checkedAt:string;offsetMs?:number;uncertaintyMs?:number;message:string}
const epoch=2208988800;
function ntpTime(buffer:Buffer,at:number){return (buffer.readUInt32BE(at)-epoch)*1000+buffer.readUInt32BE(at+4)*1000/2**32;}
export function classifyClock(offsets:number[],uncertaintyMs:number,now=Date.now()):ClockHealth{
 const checkedAt=new Date(now).toISOString();
 if(offsets.length<2||Math.max(...offsets)-Math.min(...offsets)>1500||uncertaintyMs>1000)return {state:'unknown',checkedAt,message:'Clock accuracy could not be verified against independent time servers. Signal evaluation and paper fills are paused.'};
 const offsetMs=offsets.reduce((a,b)=>a+b,0)/offsets.length;
 return {state:Math.abs(offsetMs)+uncertaintyMs>3000?'blocked':'ok',checkedAt,offsetMs,uncertaintyMs,message:Math.abs(offsetMs)+uncertaintyMs>3000?`Computer clock differs from network time by approximately ${(Math.abs(offsetMs)/1000).toFixed(1)} seconds. Synchronise the system clock; signals and paper fills are paused.`:'System clock verified against two network time servers.'};
}
async function sample(host:string):Promise<{offset:number;uncertainty:number}>{
 return new Promise((resolve,reject)=>{
  const socket=createSocket('udp4'),packet=Buffer.alloc(48);packet[0]=0x23;
  const started=Date.now(),monotonic=performance.now();
  packet.writeUInt32BE(Math.floor(started/1000)+epoch,40);packet.writeUInt32BE(Math.floor((started%1000)/1000*2**32),44);
  const timer=setTimeout(()=>finish(new Error('Time server unavailable')),2500);
  let done=false;
  const finish=(error?:Error,value?:{offset:number;uncertainty:number})=>{if(done)return;done=true;clearTimeout(timer);socket.close();if(error)reject(error);else resolve(value!);};
  socket.on('error',error=>finish(error));
  socket.on('message',buffer=>{
   const elapsed=performance.now()-monotonic,ended=Date.now();
   if(buffer.length<48||(buffer[0]&7)!==4||(buffer[0]>>6)===3||buffer[1]<1||buffer[1]>15||!buffer.subarray(24,32).equals(packet.subarray(40,48)))return;
   if(Math.abs(ended-started-elapsed)>100) return finish(new Error('Clock changed during measurement'));
   const received=ntpTime(buffer,32),sent=ntpTime(buffer,40),delay=elapsed-(sent-received);
   if(delay< -10||delay>2000)return finish(new Error('Time sample too uncertain'));
   finish(undefined,{offset:((received-started)+(sent-ended))/2,uncertainty:Math.max(0,delay)/2+buffer.readUInt32BE(8)/65536*1000});
  });
  socket.send(packet,123,host,error=>{if(error)finish(error);});
 });
}
export async function refreshClockHealth(){
 const samples=await Promise.allSettled(['time.windows.com','time.cloudflare.com','time.google.com'].map(sample));
 const valid=samples.flatMap(x=>x.status==='fulfilled'?[x.value]:[]);
 const status=classifyClock(valid.map(x=>x.offset),Math.max(0,...valid.map(x=>x.uncertainty)));
 await redis.set(CLOCK_KEY,JSON.stringify(status),'EX',90);return status;
}
export async function clockHealth():Promise<ClockHealth>{
 const raw=await redis.get(CLOCK_KEY);if(raw){const status=JSON.parse(raw) as ClockHealth;const age=Date.now()-Date.parse(status.checkedAt);if(age>=0&&age<90000)return status;}
 return {state:'unknown',checkedAt:new Date().toISOString(),message:'Waiting for system clock verification. Signal evaluation and paper fills are paused.'};
}
