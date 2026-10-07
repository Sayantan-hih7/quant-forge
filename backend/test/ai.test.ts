import { workspaceChat, workspaceChatSchema } from '../src/modules/ai/services/workspace-chat.service.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError, AxiosHeaders } from 'axios';
import { env } from '../src/config/env.js';
import { jobs, redis } from '../src/shared/redis.js';
import { AppError } from '../src/shared/errors.js';
import { aiRequestSchema, aiResponseSchema } from '../src/modules/ai/validations/ai.validation.js';
import { draftContext, monthlyDraft, tradingDraft, riskDraft, type Capabilities } from '../src/modules/ai/services/proposal.service.js';
import { proposeRules } from '../src/modules/ai/services/assistant.service.js';
import { geminiError, geminiRequest } from '../src/modules/ai/providers/gemini.provider.js';
import { geminiSchema } from '../src/modules/ai/providers/gemini-schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { explicitRiskSchema, normalizeRiskReply } from '../src/modules/ai/providers/proposal-schema.js';
import { validateRiskIntent } from '../src/modules/ai/services/risk-intent.service.js';
import { riskSchema } from '../src/modules/strategies/validations/strategy.validation.js';
import { mondayPrompt, momentumProposal, turnoverQuestion } from './fixtures/ai-momentum.js';
import { invalidProposalError } from '../src/modules/ai/services/proposal-error.js';

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
const readyIntent = { status: 'ready', message: 'The requested changes are clear.', requirements: ['Use the supplied settings.'], riskFeatures: { partialExits: 'keep', breakeven: 'keep', trailing: 'keep' }, assumptions: [], questions: [], blockers: [], example: null };
const generateAfterIntent = (response: unknown) => async (system: string) => system.startsWith('You are the clarification stage') ? readyIntent : response;

test('AI can propose candle-low risk, target stop steps and explicitly disabled sell conditions',()=>{
  const proposed={...strategy,exit:{enabled:false,logic:'AND',groups:[]},risk:{...strategy.risk,stopMode:'candleLow',exitTargets:[
    {basis:'risk',value:2,closePercent:40,moveStopTo:0},
    {basis:'risk',value:5,closePercent:30,moveStopTo:1},
    {basis:'risk',value:8,closePercent:30},
  ]}};
  const draft=tradingDraft(proposed,capabilities);
  assert.equal(draft.exit.enabled,false);
  assert.deepEqual(draft.exit.groups,[]);
  assert.equal(draft.risk.stopMode,'candleLow');
  assert.deepEqual(draft.risk.exitTargets,proposed.risk.exitTargets);
  const context=draftContext('strategy',draft) as typeof draft;
  assert.equal(context.exit.enabled,false);
  assert.deepEqual(context.risk.exitTargets,proposed.risk.exitTargets);
  assert.throws(()=>tradingDraft({...proposed,entry:{...proposed.entry,enabled:false}},capabilities));
});

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

test('AI proposal and editable context preserve valid partial exits and reject invalid allocations', () => {
  const risk = { ...strategy.risk, exitTargets: [{ profitPercent: 2, closePercent: 40 }, { profitPercent: 5, closePercent: 60 }], breakevenAfterTarget1: true };
  const draft = tradingDraft({ ...strategy, risk }, capabilities);
  assert.deepEqual(draft.risk.exitTargets, risk.exitTargets);
  assert.equal(draft.risk.breakevenAfterTarget1, true);
  assert.deepEqual((draftContext('strategy', draft) as { risk: unknown }).risk, risk);
  assert.throws(() => tradingDraft({ ...strategy, risk: { ...risk, exitTargets: [{ profitPercent: 2, closePercent: 40 }, { profitPercent: 5, closePercent: 40 }] } }, capabilities), /100%/);
});
test('AI accepts bounded conversation data and only forwards editable draft properties', () => {
  assert.equal(aiRequestSchema.safeParse({ scope: 'monthly', prompt: 'Monthly EMA rules', messages: [] }).success, true);
  assert.equal(aiRequestSchema.safeParse({ scope: 'monthly', prompt: 'x'.repeat(1201) }).success, false);
  assert.equal(aiRequestSchema.safeParse({ scope: 'monthly', prompt: 'Monthly rules', execute: true }).success, false);
  const draft = draftContext('monthly', { password: 'sensitive-fixture', groups: [null, { logic: 'AND', conditions: [{ ...condition, apiKey: 'sensitive-fixture' }] }] });
  assert.equal(JSON.stringify(draft).includes('sensitive-fixture'), false);
  assert.equal(aiResponseSchema('monthly').safeParse({ message: 'Which timeframe?', assumptions: [], proposal: null }).success, true);
});

test('AI preserves currency target units and removes unrelated nested target properties', () => {
  for(const basis of ['amount','price']){
    const risk = { ...strategy.risk, exitTargets: [{ basis, value: 10, closePercent: 40 }, { basis, value: 20, closePercent: 60 }] };
    const draft = tradingDraft({ ...strategy, risk }, capabilities);
    assert.deepEqual(draft.risk, risk);
    const context=draftContext('strategy',{...draft,risk:{...risk,exitTargets:risk.exitTargets.map(t=>({...t,privateFixture:'do-not-forward'}))}});
    assert.equal(JSON.stringify(context).includes('do-not-forward'),false);
    assert.deepEqual((context as {risk:unknown}).risk,risk);
  }
});
test('AI preserves R exits, limit entry and stop adjustments while stripping unrelated nested data', () => {
  const risk = { ...strategy.risk, stopMode: 'price', stopValue: 96, entryOrderType: 'limit', entryLimitPrice: 100,
    exitTargets: [{ basis: 'risk', value: 2, closePercent: 30 }, { basis: 'risk', value: 4, closePercent: 30 }, { basis: 'risk', value: 5, closePercent: 40 }],
    stopManagement: { breakeven: { trigger: 'risk', at: 1 }, trailing: { trigger: 'target', at: 1, distanceR: 1 } } };
  const draft = tradingDraft({ ...strategy, risk }, capabilities);
  assert.deepEqual(draft.risk, risk);
  const context = draftContext('strategy', { ...draft, risk: { ...risk, stopManagement: {
    ...risk.stopManagement, privateFixture: 'do-not-forward',
    trailing: { ...risk.stopManagement.trailing, privateFixture: 'do-not-forward' },
  } } });
  assert.deepEqual((context as {risk:unknown}).risk, risk);
  assert.equal(JSON.stringify(context).includes('do-not-forward'), false);
});

test('risk-only assistance can complete an unfinished draft without adding buy/sell rules', () => {
  const current = { name: '', entry: { horizon: 'intraday', groups: [] }, exit: { groups: [] } };
  assert.deepEqual(riskDraft({ risk: strategy.risk }, current), { risk: strategy.risk });
  assert.throws(() => riskDraft({ risk: strategy.risk, entry: strategy.entry }, current));
  assert.throws(() => riskDraft({ risk: { ...strategy.risk, overnight: true } }, current), /horizon/);
  assert.equal(aiRequestSchema.safeParse({ scope: 'monthly', focus: 'risk', prompt: 'Help with exits', currentDraft: current }).success, false);
  assert.equal(aiRequestSchema.safeParse({ scope: 'strategy', focus: 'risk', prompt: 'Help with exits' }).success, false);
  assert.equal(aiResponseSchema('strategy', 'risk').safeParse({ message: 'Questions', assumptions: [], proposal: null,
    questions: Array.from({ length: 4 }, (_, i) => ({ id: 'q_' + i, question: 'Which price?', reason: 'Price role matters', options: [] })) }).success, false);
});

test('unresolved questions and missing capabilities never return an actionable AI proposal', async () => {
  const key = env.GEMINI_API_KEY; env.GEMINI_API_KEY = 'unit-test-only';
  try {
    let validations = 0;
    const deps = { capabilities: async () => capabilities, usage: async () => {}, validate: async () => { validations++; },
      generate: generateAfterIntent({ message: 'Is 100 an example or a buy limit?', assumptions: [], proposal: { risk: strategy.risk },
        questions: [{ id: 'price_role', question: 'Is 100 an example or an actual buy limit?', reason: 'A limit changes when your order can fill.', options: ['Example only', 'Actual buy limit'] }], blockers: [], example: { entry: 100, atr: null } }) };
    const request = { scope: 'strategy' as const, focus: 'risk' as const, prompt: 'Use 100 entry with 96 stop', messages: [], currentDraft: { entry: { horizon: 'intraday' }, risk: strategy.risk } };
    const question = await proposeRules(request, undefined, deps);
    assert.equal(question.proposal, null); assert.equal(question.questions.length, 1); assert.equal(validations, 0);
    const blocked = await proposeRules(request, undefined, { ...deps, generate: generateAfterIntent({ message: 'This needs another stop mode.', assumptions: [],
      questions: [], blockers: ['Dynamic ATR trailing after a target is not supported. Choose an R distance.'], example: null, proposal: { risk: strategy.risk } }) });
    assert.equal(blocked.proposal, null); assert.equal(blocked.blockers.length, 1);
    const ready = await proposeRules(request, undefined, { ...deps, generate: generateAfterIntent({ message: 'Review your settings.', assumptions: [],
      questions: [], blockers: [], example: { entry: 100, atr: null }, proposal: { risk: { ...strategy.risk, stopMode: 'fixed', stopPercent: 4 } } }) });
    assert.ok(ready.proposal && 'risk' in ready.proposal);
    assert.equal('entry' in ready.proposal, false); assert.equal(validations, 0);
    assert.deepEqual(ready.example, { entry: 100, atr: null });
    assert.equal('entryLimitPrice' in ready.proposal.risk, false);
  } finally { env.GEMINI_API_KEY = key; }
});

test('confirmed partial exits cannot be described in text but omitted from the actual settings', async () => {
  const key = env.GEMINI_API_KEY; env.GEMINI_API_KEY = 'unit-test-only';
  try {
    let calls = 0;
    const result = await proposeRules({ scope: 'strategy', focus: 'risk', prompt: 'Sell half at 2R and half at 4R', messages: [], currentDraft: { entry: { horizon: 'intraday' }, risk: strategy.risk } }, undefined, {
      capabilities: async () => capabilities, usage: async () => {}, validate: async () => {},
      generate: async (_system, input) => {
        calls++;
        if (calls === 1) return { ...readyIntent, riskFeatures: { partialExits: 'set', breakeven: 'keep', trailing: 'keep' } };
        if (calls === 2) return { message: 'Configured partial exits.', assumptions: [], proposal: { risk: strategy.risk } };
        assert.ok(JSON.parse(input).correction.includes('partialExits'));
        return { message: 'Review the actual targets.', assumptions: [], proposal: { risk: { ...strategy.risk, exitTargets: [{ basis: 'risk', value: 2, closePercent: 50 }, { basis: 'risk', value: 4, closePercent: 50 }] } } };
      },
    });
    assert.equal(calls, 3); assert.ok(result.proposal && 'risk' in result.proposal); assert.equal(result.proposal.risk.exitTargets?.length, 2);
  } finally { env.GEMINI_API_KEY = key; }
});

test('provider risk schema explicitly includes optional settings and normalizes only their null placeholders', () => {
  const raw = zodToJsonSchema(aiResponseSchema('strategy', 'risk'), { $refStrategy: 'none' });
  const explicit = JSON.stringify(explicitRiskSchema(raw));
  assert.ok(explicit.includes('null only when this setting is unused'));
  const normalized = normalizeRiskReply({ message: 'Review', assumptions: [], example: { entry: 100, atr: null }, proposal: { risk: { ...strategy.risk,
    entryLimitPrice: null, stopManagement: null, exitTargets: [{ basis: 'risk', value: 2, profitPercent: null, closePercent: 50 }, { basis: 'risk', value: 4, profitPercent: null, closePercent: 50 }] } } });
  assert.equal(aiResponseSchema('strategy', 'risk').safeParse(normalized).success, true);
  assert.deepEqual((normalized as { example: unknown }).example, { entry: 100, atr: null });
});

test('unrelated risk edits preserve saved exit allocations and legacy breakeven semantics', () => {
  const before = riskSchema.parse({ ...strategy.risk, exitTargets: [{ profitPercent: 2, closePercent: 30 }, { profitPercent: 4, closePercent: 70 }], breakevenAfterTarget1: true });
  const keep = { partialExits: 'keep', breakeven: 'keep', trailing: 'keep' } as const;
  assert.doesNotThrow(() => validateRiskIntent({ ...before, riskPercent: 0.5 }, keep, before));
  assert.throws(() => validateRiskIntent({ ...before, exitTargets: undefined }, keep, before), /Preserve.*partialExits/);
  assert.throws(() => validateRiskIntent({ ...before, exitTargets: [{ profitPercent: 2, closePercent: 50 }, { profitPercent: 4, closePercent: 50 }] }, keep, before), /Preserve/);
  assert.doesNotThrow(() => validateRiskIntent({ ...before, breakevenAfterTarget1: false, stopManagement: { breakeven: { trigger: 'target', at: 1 } } }, keep, before));
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
    const visitSchema = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visitSchema); return; }
      if (!value || typeof value !== 'object') return;
      for (const [key,child] of Object.entries(value)) {
        // A SAR setting named maximum is a property name, not a grammar bound.
        if (key === 'properties') Object.values(child as object).forEach(visitSchema);
        else { assert.equal(/^(minLength|maxLength|minItems|maxItems|minimum|maximum|exclusiveMinimum|exclusiveMaximum)$/.test(key),false); visitSchema(child); }
      }
    };
    visitSchema(adapted);
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
  assert.deepEqual(geminiSchema({ anyOf: [{ type: 'string', enum: ['market', 'limit'] }, { type: 'null' }] }),
    { type: ['string', 'null'], enum: ['market', 'limit', null] });
});

test('Monday example clarifies turnover semantics and validates the full agreed draft from scratch', async () => {
  const key = env.GEMINI_API_KEY; env.GEMINI_API_KEY = 'unit-test-only';
  try {
    const available = { ...capabilities, snapshotFields: [...capabilities.snapshotFields, 'turnover'] };
    const currentDraft = { name: '', entry: { horizon: 'intraday', groups: [{ logic: 'AND', conditions: [] }] },
      exit: { horizon: 'intraday', groups: [{ logic: 'OR', conditions: [] }] }, risk: strategy.risk };
    const request = { scope: 'strategy' as const, prompt: mondayPrompt, messages: [], currentDraft };
    let calls = 0, validated = 0;
    const deps = { capabilities: async () => available, usage: async () => {}, validate: async () => { validated++; },
      generate: async (system: string) => { calls++; assert.ok(system.includes('NOT the last completed day'));
        return { ...readyIntent, status: 'clarify', questions: [turnoverQuestion] }; } };
    const clarification = await proposeRules(request, undefined, deps);
    assert.equal(clarification.proposal, null); assert.equal(calls, 1); assert.equal(validated, 0);
    assert.deepEqual(clarification.questions, [turnoverQuestion]);
    const result = await proposeRules({ ...request, prompt: 'Use the monthly average >= Rs 20 crore. Keep everything else as requested.',
      messages: [{ role: 'user', text: mondayPrompt }, { role: 'assistant', text: turnoverQuestion.question }] }, undefined, {
      ...deps, generate: async (system, input) => {
        assert.equal(JSON.parse(input).conversation[0].text, mondayPrompt);
        return system.startsWith('You are the clarification stage')
          ? { ...readyIntent, riskFeatures: { partialExits: 'set', breakeven: 'set', trailing: 'remove' } }
          : { message: 'Review the agreed strategy using average daily turnover.', assumptions: [], proposal: momentumProposal };
      },
    });
    assert.deepEqual(result.proposal, tradingDraft(momentumProposal, available));
    assert.equal(validated, 2);
  } finally { env.GEMINI_API_KEY = key; }
});

test('invalid AI drafts identify the failed control without echoing arbitrary model values', () => {
  const result = aiResponseSchema('strategy').safeParse({ message: 'Draft', assumptions: [], proposal: {
    ...momentumProposal, risk: { ...momentumProposal.risk, stopPercent: 0, entryOrderType: 'private-invalid-value' },
  } });
  assert.equal(result.success, false);
  if (result.success) return;
  const error = invalidProposalError(result.error);
  assert.equal(error.code, 'AI_INVALID_PROPOSAL');
  assert.match(error.message, /Stop percentage/); assert.match(error.message, /Buy order type/);
  assert.match(error.message, /draft is unchanged/); assert.doesNotMatch(error.message, /private-invalid-value/);
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
      { ...deps, generate: async () => ({ ...readyIntent, status: 'clarify', message: 'How long do you plan to hold?', questions: [{ id: 'holding', question: 'How long do you plan to hold?', reason: 'This determines session closing.', options: ['Within the day', 'Across days'] }] }) });
    assert.equal(question.proposal, null);
    const explanation = await proposeRules({ scope: 'strategy', prompt: 'Explain the current risk', messages: [] }, undefined,
      { ...deps, generate: async () => ({ ...readyIntent, status: 'explain', message: 'The initial stop protects the position before targets.' }) });
    assert.equal(explanation.proposal, null);
    assert.equal('explanationOnly' in explanation && explanation.explanationOnly, true);
  } finally { env.GEMINI_API_KEY = key; }
});


test('connected daily turnover is drafted directly without replacing it with a monthly average', async () => {
  const key = env.GEMINI_API_KEY; env.GEMINI_API_KEY = 'unit-test-only';
  try {
    const available = { ...capabilities, technical: [...capabilities.technical, 'dailyTurnover'] };
    const proposal = structuredClone(momentumProposal);
    proposal.entry.groups[0].conditions[1].left = 'dailyTurnover';
    proposal.entry.groups[0].conditions[1].right = 'dailyTurnover';
    const result = await proposeRules({ scope: 'strategy', prompt: mondayPrompt, messages: [] }, undefined, {
      capabilities: async () => available, usage: async () => {}, validate: async () => {},
      generate: async system => {
        assert.ok(system.includes('dailyTurnover'));
        return system.startsWith('You are the clarification stage')
          ? { ...readyIntent, riskFeatures: { partialExits: 'set', breakeven: 'set', trailing: 'remove' } }
          : { message: 'Uses the actual last completed session turnover.', assumptions: [], proposal };
      },
    });
    assert.deepEqual(result.questions, []);
    assert.equal((result.proposal as ReturnType<typeof tradingDraft>).entry.groups[0].conditions[1].left, 'dailyTurnover');
  } finally { env.GEMINI_API_KEY = key; }
});


test('large strategy schemas use JSON mode without rejected provider grammar; small requests retain grammar', () => {
  const schema = geminiSchema(explicitRiskSchema(zodToJsonSchema(aiResponseSchema('strategy'), { $refStrategy: 'none' })));
  const request = geminiRequest('Draft rules', 'Fix sell conflict', schema);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.equal('responseJsonSchema' in request.generationConfig, false);
  assert.ok(request.systemInstruction.parts[0].text.includes(JSON.stringify(schema)));
  assert.deepEqual(request.contents, [{ role: 'user', parts: [{ text: 'Fix sell conflict' }] }]);
  const small = { type: 'object', properties: { message: { type: 'string' } } };
  assert.deepEqual(geminiRequest('Clarify', 'Question', small).generationConfig.responseJsonSchema, small);
});


const chatEmpty = { usage: async () => {}, strategies: async () => [], monthly: async () => null };
const chatReply = (proposal: ReturnType<typeof tradingDraft> | ReturnType<typeof monthlyDraft> | null) => ({ text: 'Review the proposal', assumptions: [], proposal, questions: [], blockers: [], example: null, explanationOnly: false, provider: 'Test', configured: true, model: 'test' });

test('workspace guidance cannot invent actions and accepts no preference field', async () => {
  const dependencies = { ...chatEmpty, generate: async () => ({ text: 'Inspect the feed.', action: 'connections' }), propose: async () => { throw new Error('Must not generate'); } };
  const reply = await workspaceChat(workspaceChatSchema.parse({ prompt: 'Why snapshot?' }), undefined, dependencies);
  assert.equal(reply.destination, '/data-sources'); assert.equal(reply.proposal, null);
  await assert.rejects(workspaceChat(workspaceChatSchema.parse({ prompt: 'Place a trade' }), undefined, { ...dependencies, generate: async () => ({ text: 'Done', action: 'execute-order' }) }));
  assert.equal(workspaceChatSchema.safeParse({ prompt: 'hello', preferences: 'NSE only' }).success, false);
});

test('workspace editing uses actual saved strategy and retains its revision across follow-ups', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const saved = { ...tradingDraft(strategy, capabilities), _id: id, revision: 4 };
  const task = { scope: 'strategy', id, revision: 4 };
  const dependencies = { ...chatEmpty, strategies: async () => [saved], generate: async () => ({ text: 'Edit this strategy', action: 'edit-strategy', strategyId: id }), propose: async (input: import('../src/modules/ai/validations/ai.validation.js').AiRequest) => {
    assert.equal(input.scope, 'strategy'); assert.equal(input.currentDraft?.name, saved.name);
    return chatReply(tradingDraft(strategy, capabilities));
  } };
  const reply = await workspaceChat(workspaceChatSchema.parse({ prompt: 'Edit my intraday strategy' }), undefined, dependencies);
  assert.deepEqual(reply.task, task); assert.ok(reply.baseline); assert.ok(reply.review); assert.ok(reply.proposal);
  let calls = 0;
  const next = await workspaceChat(workspaceChatSchema.parse({ prompt: 'Use 100000 capital', task, currentDraft: saved }), undefined, { ...dependencies, generate: async () => ({ text: 'Continue', action: 'continue' }), propose: async input => { calls++; assert.equal(input.currentDraft?.name, saved.name); return chatReply(null); } });
  assert.equal(calls, 1); assert.equal(next.proposal, null);
  await assert.rejects(workspaceChat(workspaceChatSchema.parse({ prompt: 'Change risk', task: { ...task, revision: 3 } }), undefined, { ...dependencies, generate: async () => ({ text: 'Continue', action: 'continue' }) }), /changed or was archived/);
});

test('monthly chat starts from saved qualification and can switch away from strategy task', async () => {
  const rule = monthlyDraft(monthly, capabilities);
  const reply = await workspaceChat(workspaceChatSchema.parse({ prompt: 'Now add a monthly market cap rule', task: { scope: 'strategy', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: 0 }, currentDraft: { name: 'unrelated' } }), undefined, {
    ...chatEmpty, monthly: async () => ({ revision: 6, rule }), generate: async () => ({ text: 'Monthly qualification', action: 'qualification' }), propose: async input => {
      assert.equal(input.scope, 'monthly'); assert.deepEqual(input.currentDraft, rule); return chatReply(rule);
    },
  });
  assert.deepEqual(reply.task, { scope: 'monthly', id: 'monthly', revision: 6 });
  assert.ok(reply.review); assert.deepEqual(reply.baseline, rule);
});

test('chat rejects unknown edit target and stale monthly rules before generation', async () => {
  const dependencies = { ...chatEmpty, generate: async () => ({ text: 'Edit', action: 'edit-strategy', strategyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), propose: async () => { throw new Error('Must not generate'); } };
  await assert.rejects(workspaceChat(workspaceChatSchema.parse({ prompt: 'Edit a missing strategy' }), undefined, dependencies), /Choose the strategy/);
  await assert.rejects(workspaceChat(workspaceChatSchema.parse({ prompt: 'Change market cap', task: { scope: 'monthly', id: 'monthly', revision: 1 } }), undefined, { ...dependencies, generate: async () => ({ text: 'Continue', action: 'continue' }) }), /Monthly rules changed/);
});

test('AI editing context keeps trading costs and intraday entry cutoff', () => {
  const result = draftContext('strategy', { risk: { costModel: 'indian-cash', entryCutoffMinute: 900, exchangeFeePercent: 0.003, secret: 'omit' } }) as { risk: Record<string, unknown> };
  assert.equal(result.risk.costModel, 'indian-cash'); assert.equal(result.risk.entryCutoffMinute, 900); assert.equal(result.risk.secret, undefined);
});

test('workspace follow-up with no task is rerouted instead of pretending a draft exists',async()=>{
 let calls=0,proposals=0;
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Swing, paper capital 100000'}),undefined,{
  usage:async()=>{},strategies:async()=>[],monthly:async()=>null,
  generate:async()=>++calls===1?{text:'Continue',action:'continue'}:{text:'Preparing your draft',action:'draft-strategy'},
  propose:async()=>{proposals++;return {text:'Choose your risk',assumptions:[],questions:[{id:'risk',question:'Risk?',reason:'Sizing',options:['0.25%']}],blockers:[],example:null,proposal:null,...{provider:'Gemini' as const,model:'test',configured:true}};},
 });
 assert.equal(calls,2);assert.equal(proposals,1);assert.equal(result.task?.scope,'strategy');assert.equal(result.questions[0].id,'risk');
});

test('occupied strategy slot asks a relevant choice and never claims the discarded draft is ready',async()=>{
 const saved={...tradingDraft(strategy,capabilities),_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:4};
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Build a new intraday draft'}),undefined,{
  ...chatEmpty,strategies:async()=>[saved],generate:async()=>({text:'Prepare',action:'draft-strategy'}),propose:async()=>chatReply(tradingDraft(strategy,capabilities)),
 });
 assert.equal(result.proposal,null);assert.match(result.text,/already have/);assert.equal(result.questions[0].id,'existing_strategy');assert.equal(result.questions[0].allowRecommendedDefault,false);
});


test('improve correction edits the workflow strategy instead of reopening backtest or an unrelated draft',async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',old='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const saved={...tradingDraft(strategy,capabilities),_id:id,revision:6};
 for(const action of ['explain','edit-strategy','continue']){
 let proposals=0;
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'no i mean improve strategy for probable good results.',task:{scope:'strategy',id:old,revision:0},currentDraft:{name:'Unrelated draft'},activeWorkflow:{kind:'backtest',strategyId:id,revision:6}}),undefined,{
 ...chatEmpty,strategies:async()=>[saved],generate:async()=>({text:'Test it',action,strategyId:id,workflow:{kind:'backtest',strategyId:id}}),
 prepareWorkflow:async()=>{throw new Error('Must not reopen a backtest');},propose:async input=>{proposals++;assert.equal(input.currentDraft?.name,saved.name);return chatReply(tradingDraft(strategy,capabilities));}
 });assert.equal(proposals,1);assert.deepEqual(result.task,{scope:'strategy',id,revision:6});assert.ok(result.proposal);assert.ok('clearWorkflow' in result&&result.clearWorkflow);
 }
});
test('ambiguous improvement correction asks for strategy instead of guessing workflow target',async()=>{
 const a={...tradingDraft(strategy,capabilities),_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:6};
 const b={...a,_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Other'};
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Improve strategy for better results'}),undefined,{...chatEmpty,strategies:async()=>[a,b],generate:async()=>({text:'Run it',action:'explain',workflow:{kind:'backtest',strategyId:a._id}}),propose:async()=>{throw new Error('Must clarify');},prepareWorkflow:async()=>{throw new Error('Must not run');}});
 assert.equal(result.questions[0].id,'improve_strategy');assert.equal(result.proposal,null);
});


test('named holding period overrides the previous workflow when improving another strategy',async()=>{
 const a={...tradingDraft(strategy,capabilities),_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Intraday plan',revision:6};
 const b={...a,_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Swing plan',entry:{...a.entry,horizon:'swing'}};
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Improve my swing strategy',activeWorkflow:{kind:'backtest',strategyId:a._id,revision:6}}),undefined,{...chatEmpty,strategies:async()=>[a,b],generate:async()=>({text:'Run it',action:'explain',workflow:{kind:'backtest',strategyId:b._id}}),propose:async input=>{assert.equal(input.currentDraft?.name,b.name);return chatReply(null);},prepareWorkflow:async()=>{throw new Error('Must not run');}});
 assert.equal(result.task?.id,b._id);
});

test('invalid relative strength interval names the condition and a valid alternative',()=>{
 const caps={...capabilities,technical:[...capabilities.technical,'relativeStrength']};
 const rule={...technical,left:'relativeStrength',leftFrame:'5m',rightType:'value',operator:'gt',value:0};
 const draft={...strategy,entry:{logic:'AND',groups:[{logic:'AND',conditions:[rule]}]}};
 assert.throws(()=>tradingDraft(draft,caps),(error:unknown)=>{assert.ok(error instanceof AppError);const visible=invalidProposalError(error);assert.match(visible.message,/Buy rule, group 1, condition 1/);assert.match(visible.message,/Relative strength vs benchmark cannot use 5m/);assert.match(visible.message,/1d, 1w, 1mo/);return true;});
 assert.doesNotThrow(()=>tradingDraft({...draft,entry:{logic:'AND',groups:[{logic:'AND',conditions:[{...rule,leftFrame:'1d'}]}]}},caps));
});

test('workspace returns failed draft explanation in chat without stale questions or actionable proposal',async()=>{
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'Apply my confirmed settings'}),undefined,{...chatEmpty,generate:async()=>({text:'Draft',action:'draft-strategy'}),propose:async()=>{throw invalidProposalError(new AppError(422,'AI_RULE_CONSTRAINT','Buy rule, group 1, condition 1: Relative strength requires daily candles. Choose 1d.'));}});
 assert.match(result.text,/Choose 1d/);assert.equal(result.proposal,null);assert.equal(result.review,null);assert.deepEqual(result.questions,[]);assert.deepEqual(result.assumptions,[]);assert.equal(result.blockers.length,1);assert.ok('clearWorkflow' in result&&result.clearWorkflow);
});

test('explicit existing strategy choice binds to its saved revision instead of asking again',async()=>{
 const saved={...tradingDraft(strategy,capabilities),_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Intraday plan',revision:6};
 const result=await workspaceChat(workspaceChatSchema.parse({prompt:'My answers:\n1. [existing_strategy] Prepare changes to Intraday plan'}),undefined,{...chatEmpty,strategies:async()=>[saved],generate:async()=>({text:'New draft',action:'draft-strategy'}),propose:async input=>{assert.equal(input.currentDraft?.name,saved.name);return chatReply(null);}});
 assert.equal(result.task?.id,saved._id);assert.equal(result.task?.revision,6);
});
