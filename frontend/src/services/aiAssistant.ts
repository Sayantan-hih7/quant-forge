import { apiClient } from './apiClient';
import { z } from 'zod';

export interface AiMessage { role: 'user' | 'assistant'; text: string; questions?: AiQuestion[] }
export interface AiStatus { configured: boolean; provider: string; model: string }
const questionSchema = z.object({ id: z.string().regex(/^[a-z0-9_]{1,40}$/), question: z.string().min(1).max(300), reason: z.string().max(300), options: z.array(z.string().min(1).max(120)).max(4) });
const exampleSchema = z.object({ entry: z.number().positive().max(10000000).nullable(), atr: z.number().positive().max(10000000).nullable() });
const dialogueSchema = z.object({ questions: z.array(questionSchema).max(3).default([]), blockers: z.array(z.string().max(400)).max(5).default([]), example: exampleSchema.nullable().default(null), explanationOnly: z.boolean().default(false) });
export type AiQuestion = z.infer<typeof questionSchema>;
export type AiExample = z.infer<typeof exampleSchema>;
export type AiDialogue = z.infer<typeof dialogueSchema>;
export interface AiReply<T> extends AiDialogue { text: string; assumptions: string[]; proposal: T | null; provider: string; model: string }
export interface AiInput { scope: 'monthly' | 'strategy'; focus?: 'risk'; example?: AiExample; prompt: string; messages: AiMessage[]; currentDraft?: object }
export async function requestAiProposal<T>(input: AiInput, validate: (value: unknown) => T, signal: AbortSignal): Promise<AiReply<T>> {
  const { data } = await apiClient.post<AiReply<unknown>>('/ai/proposals', {
    ...input, messages: input.messages.slice(-10).map(item => ({ role: item.role, text: item.questions?.length
      ? (item.text.slice(0, 1200) + '\nQuestions in order:\n' + item.questions.map((q, i) => `${i + 1}. ${q.question} Options: ${q.options.join('; ')}`).join('\n')).slice(0, 4000)
      : item.text.slice(0, 4000) })),
  }, { signal, timeout: 205_000 });
  if (typeof data.text !== 'string' || !Array.isArray(data.assumptions)) throw new Error('The AI returned an unreadable response. Your builder is unchanged.');
  try {
    const dialogue = dialogueSchema.parse(data);
    return { ...data, ...dialogue, proposal: data.proposal === null || dialogue.questions.length || dialogue.blockers.length ? null : validate(data.proposal) };
  }
  catch { throw new Error('The AI proposal could not be opened in this builder. Please rephrase the request; your draft is unchanged.'); }
}
