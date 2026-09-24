import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError, AxiosHeaders } from 'axios';
import { env } from '../src/config/env.js';
import { jobs, redis } from '../src/shared/redis.js';
import { AppError } from '../src/shared/errors.js';
import { aiRequestSchema, aiResponseSchema } from '../src/modules/ai/validations/ai.validation.js';
import { draftContext, monthlyDraft, tradingDraft, type Capabilities } from '../src/modules/ai/services/proposal.service.js';
import { proposeRules } from '../src/modules/ai/services/assistant.service.js';
import { geminiError } from '../src/modules/ai/providers/gemini.provider.js';
import { geminiSchema } from '../src/modules/ai/providers/gemini-schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });
const capabilities: Capabilities = { monthlyFields: ['ema5', 'ema21', 'delivery', 'marketCap', 'index', 'sector'],
  technical: ['ema5', 'ema20', 'ema21', 'rsi', 'close', 'vwap'], snapshotFields: ['marketCap', 'delivery', 'index', 'sector'],
  choices: { index: [{ value: 'nifty-50', label: 'NIFTY 50' }, { value: 'bse-sensex', label: 'BSE SENSEX' }], sector: [{ value: 'Software', label: 'Software' }] } };
const condition = { field: 'ema5', operator: 'gte', operand: 'field', value: 0, upper: 70, compareField: 'ema21', multiplier: 1, distance: 2, lookback: 1, choices: [] };
const monthly = { logic: 'AND', conditions: [condition, { ...condition, field: 'delivery', operand: 'value', value: 40 }] };
const technical = { left: 'ema5', leftFrame: '15m', operator: 'crossAbove', rightType: 'indicator', value: 0, right: 'ema20', rightFrame: '15m', multiplier: 1, tolerance: 2 };
const strategy = { name: 'AI paper strategy', horizon: 'intraday', cadence: '15m',
  entry: { logic: 'AND', groups: [{ logic: 'AND', conditions: [technical] }] },
  exit: { logic: 'OR', groups: [{ logic: 'OR', conditions: [{ ...technical, operator: 'crossBelow' }] }] },
  risk: { initialCapital: 100000, riskPercent: 1, maxPositions: 4, timeframe: '15m', stopMode: 'ATR', stopPercent: 2, atrPeriod: 14, atrMultiplier: 2, targetR: 2, overnight: false, slippagePercent: 0.02, feePercent: 0.03 } };

test('AI monthly output is restricted to one monthly list and supported, compatible fields', () => {
  const draft = monthlyDraft(monthly, capabilities);
  assert.equal(draft.timeframe, '1mo'); assert.equal(draft.groups.length, 1);
  assert.equal(draft.groups[0].conditions[1].category, 'price-volume');
  assert.throws(() => monthlyDraft({ ...monthly, conditions: [{ ...condition, field: 'marketCap' }] }, capabilities), /matching units/);
  assert.throws(() => monthlyDraft({ ...monthly, conditions: [{ ...condition, field: 'vwap' }] }, capabilities));
  assert.throws(() => monthlyDraft({ ...monthly, timeframe: '5m' }, capabilities));
  assert.throws(() => monthlyDraft({ ...monthly, conditions: [{ ...condition, field: 'delivery', operator: 'crossAbove' }] }, capabilities), /technical series/);
  const index = { ...condition, field: 'index', compareField: 'index', operand: 'value', operator: 'in', choices: ['bse-sensex'] };
  assert.equal(monthlyDraft({ logic: 'AND', conditions: [index] }, capabilities).groups[0].conditions[0].choices[0], 'bse-sensex');
  assert.throws(() => monthlyDraft({ logic: 'AND', conditions: [{ ...index, choices: ['invented-index'] }] }, capabilities), /supported index/);
});
test('AI trading output preserves paired long-only rules and rejects mismatched frames, units and risk', () => {
  const draft = tradingDraft(strategy, capabilities);
  assert.equal(draft.entry.side, 'BUY'); assert.equal(draft.exit.side, 'SELL'); assert.equal(draft.exit.tier, 'tactical');
  assert.throws(() => tradingDraft({ ...strategy, risk: { ...strategy.risk, overnight: true } }, capabilities), /horizon/);
  assert.throws(() => tradingDraft({ ...strategy, risk: { ...strategy.risk, riskPercent: 100 } }, capabilities));
  assert.throws(() => tradingDraft({ ...strategy, entry: { logic: 'AND', groups: [{ logic: 'AND', conditions: [{ ...technical, rightFrame: '1d' }] }] } }, capabilities), /same timeframe/);
});
test('AI accepts bounded conversation data and only forwards editable draft properties', () => {
  assert.equal(aiRequestSchema.safeParse({ scope: 'monthly', prompt: 'Monthly EMA rules', messages: [] }).success, true);
  assert.equal(aiRequestSchema.safeParse({ scope: 'monthly', prompt: 'x'.repeat(1201) }).success, false);
  assert.equal(aiRequestSchema.safeParse({ scope: 'monthly', prompt: 'Monthly rules', execute: true }).success, false);
  const draft = draftContext('monthly', { password: 'sensitive-fixture', groups: [null, { logic: 'AND', conditions: [{ ...condition, apiKey: 'sensitive-fixture' }] }] });
  assert.equal(JSON.stringify(draft).includes('sensitive-fixture'), false);
  assert.equal(aiResponseSchema('monthly').safeParse({ message: 'Which timeframe?', assumptions: [], proposal: null }).success, true);
});
test('provider failures remove keys, prompts and raw request details', () => {
  const error = new AxiosError('secret-fixture must not leak');
  error.response = { status: 400, statusText: 'Bad request', headers: {}, config: { headers: new AxiosHeaders() }, data: { error: { details: [{ reason: 'API_KEY_INVALID' }] } } };
  const rejected = geminiError(error);
  assert.equal(rejected.code, 'AI_CREDENTIALS'); assert.equal(JSON.stringify(rejected).includes('secret-fixture'), false);
  error.response.status = 429; error.response.data = {};
  assert.equal(geminiError(error).code, 'AI_QUOTA');
  error.response.status = 400;
  assert.equal(geminiError(error).code, 'AI_REQUEST');
});

test('Gemini schema avoids rejected bounded grammars while application validation stays strict', () => {
  for (const scope of ['monthly', 'strategy'] as const) {
    const original = aiResponseSchema(scope);
    const raw = zodToJsonSchema(original, { $refStrategy: 'none' });
    const before = JSON.stringify(raw);
    const adapted = geminiSchema(raw) as { properties: { proposal: { type: string[] } }; required: string[]; additionalProperties: boolean };
    assert.deepEqual(adapted.properties.proposal.type, ['object', 'null']);
    assert.equal(adapted.additionalProperties, false);
    assert.deepEqual(adapted.required, ['message', 'assumptions', 'proposal']);
    assert.equal(JSON.stringify(raw), before);
    const serialized = JSON.stringify(adapted);
    assert.equal(/"(?:minLength|maxLength|minItems|maxItems|minimum|maximum|exclusiveMinimum|exclusiveMaximum)":/.test(serialized), false);
    assert.ok(serialized.includes('Maximum items:'));
    assert.ok(serialized.includes('AND'));
    assert.equal(original.safeParse({ message: 'x'.repeat(3001), assumptions: [], proposal: null }).success, false);
    assert.equal(original.safeParse({ message: 'Choose a rule', assumptions: [], proposal: null }).success, true);
  }
  const response = { message: 'Review', assumptions: [], proposal: { ...monthly, conditions: Array.from({ length: 13 }, () => condition) } };
  assert.equal(aiResponseSchema('monthly').safeParse(response).success, false);
  assert.throws(() => monthlyDraft({ ...monthly, conditions: [{ ...condition, multiplier: 0 }] }, capabilities));
  assert.deepEqual(geminiSchema({ type: 'object', properties: { minimum: { type: 'number', minimum: 0 } } }), {
    type: 'object', properties: { minimum: { type: 'number', description: 'Minimum inclusive value: 0.' } },
  });
});
test('assistant validates before returning, allows one correction, and never retries unavailable engines', async () => {
  const key = env.GEMINI_API_KEY; env.GEMINI_API_KEY = 'unit-test-only';
  try {
    let calls = 0, validated = 0;
    const deps = { capabilities: async () => capabilities, usage: async () => {},
      validate: async () => { validated++; },
      generate: async (_system: string, input: string) => {
        calls++; assert.equal(input.includes('must-not-forward'), false);
        return { message: 'Review these monthly rules.', assumptions: [], proposal: calls === 1 ? { ...monthly, conditions: [{ ...condition, field: 'marketCap' }] } : monthly };
      },
    };
    const result = await proposeRules({ scope: 'monthly', prompt: 'Use monthly EMA and delivery.', messages: [], currentDraft: { password: 'must-not-forward' } }, undefined, deps);
    assert.equal(calls, 2); assert.equal(validated, 1); assert.ok(result.proposal && 'timeframe' in result.proposal);
    await assert.rejects(proposeRules({ scope: 'monthly', prompt: 'Create a rule', messages: [] }, undefined,
      { ...deps, generate: async () => ({ message: 'Proposal', assumptions: [], proposal: monthly }), validate: async () => { throw new AppError(503, 'ENGINE_UNAVAILABLE', 'Engine unavailable'); } }), /Engine unavailable/);
    const question = await proposeRules({ scope: 'strategy', prompt: 'Which timeframe should I use?', messages: [] }, undefined,
      { ...deps, generate: async () => ({ message: 'How long do you plan to hold?', assumptions: [], proposal: null }) });
    assert.equal(question.proposal, null);
  } finally { env.GEMINI_API_KEY = key; }
});
