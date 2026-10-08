import { apiClient } from './apiClient';
import { z } from 'zod';

export const sourceReportSchema=z.object({title:z.string().max(160),scope:z.string().max(400),tables:z.array(z.object({name:z.string().max(100),columns:z.array(z.string().max(100)).max(20),rows:z.array(z.array(z.union([z.string().max(1000),z.number().finite(),z.null()])).max(20)).max(100)})).max(6)});
export type SourceReport=z.infer<typeof sourceReportSchema>;
export interface AgentActivity {tool:'backtests'|'paper'|'qualification'|'connections';status:'completed'|'unavailable';checkedAt:string;summary:string;report?:SourceReport}
export const agentActivitySchema=z.array(z.object({tool:z.enum(['backtests','paper','qualification','connections']),status:z.enum(['completed','unavailable']),checkedAt:z.string(),summary:z.string().max(600),report:sourceReportSchema.optional()})).max(4);
export interface AiMessage { presentation?: Record<string,unknown>; attachments?: import('./assistantAttachments').AssistantAttachment[]; role: 'user' | 'assistant'; text: string; questions?: AiQuestion[]; activity?: AgentActivity[] }
export interface AiStatus { configured: boolean; provider: string; model: string }
const questionSchema = z.object({ id: z.string().regex(/^[a-z0-9_]{1,40}$/), question: z.string().min(1).max(300), reason: z.string().max(300), options: z.array(z.string().min(1).max(120)).max(4), recommendedOption:z.string().max(120).nullable().optional(),recommendationReason:z.string().max(300).optional(),allowRecommendedDefault:z.boolean().optional() }).superRefine((q,ctx)=>{
  if(q.recommendedOption&&!q.options.includes(q.recommendedOption)||q.allowRecommendedDefault&&(!q.recommendedOption||!q.recommendationReason))ctx.addIssue({code:'custom',message:'Invalid recommendation'});
});
export const aiQuestionsSchema=z.array(questionSchema).max(3).refine(q=>new Set(q.map(x=>x.id)).size===q.length,'Duplicate questions');
export function serializeAiMessage(item:AiMessage){
 return {role:item.role,text:item.questions?.length?(item.text.slice(0,700)+'\nQuestions in order:\n'+item.questions.map((q,i)=>`${i+1}. [${q.id}] ${q.question} Options: ${q.options.join('; ')}${q.recommendedOption?` Recommended: ${q.recommendedOption}. Default allowed: ${!!q.allowRecommendedDefault}.`:''}`).join('\n')).slice(0,4000):item.text.slice(0,4000)};
}
const exampleSchema = z.object({ entry: z.number().positive().max(10000000).nullable(), atr: z.number().positive().max(10000000).nullable() });
const dialogueSchema = z.object({ questions: aiQuestionsSchema.default([]), blockers: z.array(z.string().max(400)).max(5).default([]), example: exampleSchema.nullable().default(null), explanationOnly: z.boolean().default(false) });
export type AiQuestion = z.infer<typeof questionSchema>;
export type AiExample = z.infer<typeof exampleSchema>;
export type AiDialogue = z.infer<typeof dialogueSchema>;
export interface AiReply<T> extends AiDialogue { text: string; assumptions: string[]; proposal: T | null; provider: string; model: string }
export interface AiInput { scope: 'monthly' | 'strategy'; focus?: 'risk'; example?: AiExample; prompt: string; messages: AiMessage[]; currentDraft?: object }
export async function requestAiProposal<T>(input: AiInput, validate: (value: unknown) => T, signal: AbortSignal): Promise<AiReply<T>> {
  const { data } = await apiClient.post<AiReply<unknown>>('/ai/proposals', {
    ...input, messages: input.messages.slice(-10).map(serializeAiMessage),
  }, { signal, timeout: 205_000 });
  if (typeof data.text !== 'string' || !Array.isArray(data.assumptions)) throw new Error('The AI returned an unreadable response. Your builder is unchanged.');
  try {
    const dialogue = dialogueSchema.parse(data);
    return { ...data, ...dialogue, proposal: data.proposal === null || dialogue.questions.length || dialogue.blockers.length ? null : validate(data.proposal) };
  }
  catch { throw new Error('The AI proposal could not be opened in this builder. Please rephrase the request; your draft is unchanged.'); }
}
