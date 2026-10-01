import { env } from '../../config/env.js';
import { generateGemini } from '../ai/providers/gemini.provider.js';
import { object } from '../../shared/http-client.js';
import type { EventType } from './lexicon.js';

export const EVENT_TYPES: EventType[] = ['results', 'orders', 'corporate-action', 'deal', 'rating', 'regulatory', 'management', 'legal', 'guidance', 'market-move', 'macro', 'other'];
export interface ClassifyInput { id: string; title: string; summary: string; publisher: string; category?: string; companies: string[] }
export interface Classified { id: string; score: number; confidence: number; eventType: EventType; reason: string; companies: { name: string; score: number }[] }

const SYSTEM = `You classify Indian stock-market news for an equity research tool.
For each item, judge the likely effect of the reported facts on the share price of the company or companies it is about, from the headline and summary only.
- score: -1 (clearly negative for the stock) to 1 (clearly positive). 0 when neutral, mixed, routine, or not about a listed company.
- Routine filings (AGM notices, trading-window closures, newspaper publications, registrar updates) are 0.
- A price move itself ("shares fall 5%") is weak evidence (|score| <= 0.4) unless a cause is stated.
- confidence: 0..1, lower when the text is vague or ambiguous.
- companies: Indian listed companies the item is substantially about, named as in the text, each with its own score (a deal can help one company and hurt another). Omit companies only mentioned in passing. Empty for market-wide or macro news.
- reason: one short factual clause (max 120 characters), no advice.
Never recommend buying or selling.`;
const SCHEMA = { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['id', 'score', 'confidence', 'eventType', 'reason', 'companies'], properties: {
  id: { type: 'string' }, score: { type: 'number', minimum: -1, maximum: 1 }, confidence: { type: 'number', minimum: 0, maximum: 1 },
  eventType: { type: 'string', enum: EVENT_TYPES }, reason: { type: 'string', maxLength: 160 },
  companies: { type: 'array', maxItems: 6, items: { type: 'object', required: ['name', 'score'], properties: { name: { type: 'string', maxLength: 120 }, score: { type: 'number', minimum: -1, maximum: 1 } } } },
} } } } };

const clamp = (n: unknown, lo: number, hi: number) => { const v = Number(n); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
export const aiModel = () => env.GEMINI_MODEL;
export const aiConfigured = () => !!env.GEMINI_API_KEY;

/** One Gemini request for up to 25 stories. Unknown ids and malformed rows are dropped, never guessed. */
export async function classifyBatch(items: ClassifyInput[], generate = generateGemini): Promise<Classified[]> {
  if (!items.length) return [];
  const input = JSON.stringify(items.map(x => ({ id: x.id, headline: x.title, summary: x.summary.slice(0, 400), source: x.publisher, ...(x.category ? { filingCategory: x.category } : {}), ...(x.companies.length ? { detectedCompanies: x.companies } : {}) })));
  const output = object(await generate(SYSTEM, input, SCHEMA));
  const known = new Set(items.map(x => x.id));
  return (Array.isArray(output.items) ? output.items : []).flatMap(raw => {
    const r = object(raw), score = clamp(r.score, -1, 1), confidence = clamp(r.confidence, 0, 1);
    if (typeof r.id !== 'string' || !known.has(r.id) || score === null || confidence === null) return [];
    const eventType = EVENT_TYPES.includes(r.eventType as EventType) ? r.eventType as EventType : 'other';
    const companies = (Array.isArray(r.companies) ? r.companies : []).flatMap(c => { const o = object(c), s = clamp(o.score, -1, 1); return typeof o.name === 'string' && o.name.trim() && s !== null ? [{ name: o.name.trim().slice(0, 120), score: s }] : []; });
    return [{ id: r.id, score: Math.round(score * 100) / 100, confidence: Math.round(confidence * 100) / 100, eventType, reason: String(r.reason ?? '').slice(0, 160), companies }];
  });
}
