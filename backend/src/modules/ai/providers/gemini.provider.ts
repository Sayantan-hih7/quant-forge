import axios from 'axios';
import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/errors.js';

export function geminiError(error: unknown): AppError {
  if (!axios.isAxiosError(error)) return new AppError(502, 'AI_PROVIDER', 'The AI service could not complete this request. Your rules are unchanged.');
  const status = error.response?.status;
  const reason = error.response?.data?.error?.details?.find((item: { reason?: string }) => item.reason)?.reason;
  if ([401, 403].includes(status ?? 0) || reason === 'API_KEY_INVALID') return new AppError(424, 'AI_CREDENTIALS', 'Gemini rejected the API key. Update GEMINI_API_KEY in backend/.env and restart the API.');
  if (status === 429) return new AppError(429, 'AI_QUOTA', 'Gemini usage limit reached. Wait before retrying, or check the project quota in Google AI Studio.');
  if (status === 404) return new AppError(424, 'AI_MODEL', 'The configured Gemini model is unavailable for this project. Check GEMINI_MODEL on the backend.');
  if (status === 400) return new AppError(502, 'AI_REQUEST', 'Gemini could not accept the rule-generation request. Your draft is unchanged. If this continues, the assistant configuration needs attention.');
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new AppError(504, 'AI_TIMEOUT', 'Gemini took too long to respond. Please retry; your draft is unchanged.');
  return new AppError(502, 'AI_PROVIDER', 'Gemini could not complete the request. Please retry; your draft is unchanged.');
}
const client = axios.create({ baseURL: 'https://generativelanguage.googleapis.com/v1beta', timeout: 60_000,
  maxRedirects: 0, maxContentLength: 1_000_000, maxBodyLength: 250_000 });
client.interceptors.request.use(config => { config.headers.set('x-goog-api-key', env.GEMINI_API_KEY); return config; });
// Never propagate Axios request/config objects: they contain the API key and conversation.
client.interceptors.response.use(response => response, (error: unknown) => Promise.reject(geminiError(error)));

export async function generateGemini(system: string, input: string, schema: unknown, signal?: AbortSignal) {
  if (!env.GEMINI_API_KEY) throw new AppError(503, 'AI_NOT_CONFIGURED', 'Add GEMINI_API_KEY to backend/.env and restart the API to enable the assistant.');
  const { data } = await client.post(`/models/${env.GEMINI_MODEL}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2, maxOutputTokens: 8192 },
  }, { signal });
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw new AppError(502, 'AI_INCOMPLETE', 'The AI response was incomplete or blocked. Try a shorter, specific rule request.');
  const text = candidate.content?.parts?.filter((part: { text?: string; thought?: boolean }) => !part.thought && typeof part.text === 'string').map((part: { text: string }) => part.text).join('');
  if (!text) throw new AppError(502, 'AI_EMPTY', 'Gemini returned no rule proposal. Please rephrase your request.');
  try { return JSON.parse(text) as unknown; }
  catch { throw new AppError(502, 'AI_FORMAT', 'Gemini returned an unreadable proposal. Your rules are unchanged; please retry.'); }
}
