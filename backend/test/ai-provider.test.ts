import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError } from 'axios';
import { env } from '../src/config/env.js';
import { generateAi, parseProviderReply, providerError, providerStatus } from '../src/modules/ai/providers/provider.js';

test('provider envelopes reject incomplete output, refusal and invalid JSON', () => {
  assert.deepEqual(parseProviderReply('openai', { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] }), { ok: true });
  assert.deepEqual(parseProviderReply('anthropic', { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] }), { ok: true });
  for (const [provider, data] of [['openai', { status: 'incomplete' }], ['anthropic', { stop_reason: 'max_tokens' }], ['openai', { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }], ['anthropic', { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not JSON' }] }]] as const) assert.throws(() => parseProviderReply(provider, data));
});
test('provider error never exposes raw credential-bearing request', () => {
  const error = new AxiosError('secret-key request body');
  assert.ok(!JSON.stringify(providerError(error)).includes('secret-key'));
});
test('switching providers changes endpoint, authentication and payload without changing caller contract', async () => {
  const before = { ...env }, adapter = axios.defaults.adapter;
  try {
    for (const provider of ['openai', 'anthropic'] as const) {
      env.AI_PROVIDER = provider; env.AI_MODEL = 'test-model'; env.OPENAI_API_KEY = 'test-openai'; env.ANTHROPIC_API_KEY = 'test-claude';
      axios.defaults.adapter = async config => {
        const body = JSON.parse(config.data);
        assert.equal(body.model, 'test-model'); assert.equal(config.maxRedirects, 0);
        if (provider === 'openai') { assert.equal(config.url, 'https://api.openai.com/v1/responses'); assert.equal(config.headers.Authorization, 'Bearer test-openai'); assert.equal(body.store, false); }
        else { assert.equal(config.url, 'https://api.anthropic.com/v1/messages'); assert.equal(config.headers['x-api-key'], 'test-claude'); assert.equal(body.messages[0].content, 'input'); }
        return { config, status: 200, statusText: 'OK', headers: {}, data: provider === 'openai' ? { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] } : { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] } };
      };
      assert.equal(providerStatus().configured, true);
      assert.deepEqual(await generateAi('system', 'input', { type: 'object' }), { ok: true });
    }
    env.AI_MODEL = ''; assert.equal(providerStatus().configured, false);
    await assert.rejects(generateAi('system', 'input', {}), /Configure/);
  } finally { Object.assign(env, before); axios.defaults.adapter = adapter; }
});

test('image uploads use each providers native vision content without duplicating image bytes into text',async()=>{
 const before={...env},adapter=axios.defaults.adapter;
 const image={kind:'image' as const,name:'chart.png',mimeType:'image/png' as const,data:'iVBORw0KGgoBAgME'};
 try{
  for(const provider of ['openai','anthropic'] as const){
   env.AI_PROVIDER=provider;env.AI_MODEL='vision-test';env.OPENAI_API_KEY='test';env.ANTHROPIC_API_KEY='test';
   axios.defaults.adapter=async config=>{
    const body=JSON.parse(config.data);
    if(provider==='openai'){assert.equal(body.input[0].content[1].image_url,'data:image/png;base64,'+image.data);assert.ok(!body.input[0].content[0].text.includes(image.data));}
    else{assert.equal(body.messages[0].content[0].source.data,image.data);assert.ok(!body.messages[0].content[1].text.includes(image.data));}
    return {config,status:200,statusText:'OK',headers:{},data:provider==='openai'?{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}]}:{stop_reason:'end_turn',content:[{type:'text',text:'{"ok":true}'}]}};
   };
   assert.deepEqual(await generateAi('system','input',{},undefined,[image]),{ok:true});
  }
 }finally{Object.assign(env,before);axios.defaults.adapter=adapter;}
});
