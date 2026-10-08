import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {AxiosError} from 'axios';
import {engineClient} from '../src/modules/engine/services/engine.service.js';
import {jobs,redis} from '../src/shared/redis.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
for(const [transport,status,expected] of [['ECONNABORTED',undefined,'ENGINE_TIMEOUT'],['ECONNREFUSED',undefined,'ENGINE_UNAVAILABLE'],[undefined,503,'ENGINE_BUSY'],[undefined,401,'ENGINE_AUTH'],[undefined,500,'ENGINE_UNAVAILABLE'],[undefined,422,'ENGINE_VALIDATION']] as const){
 test(`engine diagnostics distinguish ${transport??status}`,async()=>{
  await assert.rejects(engineClient.get('/health',{adapter:async config=>{throw new AxiosError('technical details',transport,config,undefined,status?{status,statusText:'Error',headers:{},config,data:{detail:'Invalid input'}}:undefined);}}),e=>!!e&&typeof e==='object'&&'code' in e&&e.code===expected);
 });
}
