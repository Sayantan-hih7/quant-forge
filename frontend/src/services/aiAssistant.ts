import { apiClient } from './apiClient';

export interface AiMessage { role: 'user' | 'assistant'; text: string }
export interface AiStatus { configured: boolean; provider: string; model: string }
export interface AiReply<T> { text: string; assumptions: string[]; proposal: T | null; provider: string; model: string }
export interface AiInput { scope: 'monthly' | 'strategy'; prompt: string; messages: AiMessage[]; currentDraft?: object }
export async function requestAiProposal<T>(input: AiInput, validate: (value: unknown) => T, signal: AbortSignal): Promise<AiReply<T>> {
  const { data } = await apiClient.post<AiReply<unknown>>('/ai/proposals', {
    ...input, messages: input.messages.slice(-10).map(item => ({ role: item.role, text: item.text.slice(0, 4000) })),
  }, { signal, timeout: 145_000 });
  if (typeof data.text !== 'string' || !Array.isArray(data.assumptions)) throw new Error('The AI returned an unreadable response. Your builder is unchanged.');
  try { return { ...data, proposal: data.proposal === null ? null : validate(data.proposal) }; }
  catch { throw new Error('The AI proposal could not be opened in this builder. Please rephrase the request; your draft is unchanged.'); }
}
