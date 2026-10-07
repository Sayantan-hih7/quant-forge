import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aiQuestionsSchema} from '../src/modules/ai/validations/ai.validation.js';
import {attachmentsSchema,attachmentInput} from '../src/modules/ai/validations/attachment.validation.js';
import {draftContext} from '../src/modules/ai/services/proposal.service.js';
import {geminiRequest} from '../src/modules/ai/providers/gemini.provider.js';
const q={id:'capital',question:'Paper capital?',reason:'Sizing',options:['100000','50000'],recommendedOption:'100000',recommendationReason:'An editable paper example',allowRecommendedDefault:true};
test('guided defaults must identify an actual explained option and questions have unique IDs',()=>{
 assert.equal(aiQuestionsSchema.parse([q])[0].allowRecommendedDefault,true);
 for(const questions of [[{...q,recommendedOption:'999'}],[{...q,recommendationReason:undefined}],[q,q]])assert.equal(aiQuestionsSchema.safeParse(questions).success,false);
});
test('AI draft context preserves paper safety controls',()=>{
 const risk={reentryCooldownMinutes:30,maxEntriesPerStockPerDay:2,dailyLossLimitPercent:1,maxEntryDeviationPercent:0.5};
 assert.deepEqual((draftContext('strategy',{risk}) as {risk:unknown}).risk,risk);
});
test('attachments enforce format and total size; image bytes are only in multimodal content',()=>{
 const image={kind:'image' as const,name:'chart.png',mimeType:'image/png' as const,data:Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64')};
 assert.equal(attachmentsSchema.safeParse([image]).success,true);
 assert.equal(attachmentsSchema.safeParse([{...image,mimeType:'image/jpeg'}]).success,false);
 assert.equal(attachmentsSchema.safeParse([{kind:'text',name:'bad.txt',text:'a\0b'}]).success,false);
 assert.equal(attachmentsSchema.safeParse([image,image,image]).success,false);
 assert.equal(attachmentsSchema.safeParse([{kind:'text',name:'big.txt',text:'x'.repeat(20001)}]).success,false);
 assert.ok(!attachmentInput('question',[image]).includes(image.data));
 const body=geminiRequest('system','question',{},[image]);
 assert.deepEqual(body.contents[0].parts[1],{inlineData:{mimeType:image.mimeType,data:image.data}});
});
