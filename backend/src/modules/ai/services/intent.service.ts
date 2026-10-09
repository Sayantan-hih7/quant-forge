import { delegatedDraftChoices, remainingDraftQuestions } from './draft-delegation.js';
import type {AiAttachment} from '../validations/attachment.validation.js';
import {guidedDialogue} from '../config/guided-dialogue.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AppError } from '../../../shared/errors.js';
import { geminiSchema } from '../providers/gemini-schema.js';
import { generateAi } from '../providers/provider.js';
import { strategyIntentSchema } from '../validations/ai.validation.js';
import { strategyGuidance } from '../config/strategy-guidance.js';

/** Resolve intent before exposing a draft schema full of fields the model might guess. */
export async function clarifyStrategy(capabilityContext: string, input: string, signal?: AbortSignal, generate = generateAi,attachments:AiAttachment[]=[]) {
  const instruction = `You are the clarification stage of a strategy builder. Do not generate a strategy in this stage. You may recommend reversible draft defaults through guided questions.
Read the user's latest request together with the conversation and current draft. Return the intent schema.
${strategyGuidance}
${guidedDialogue}
CAPABILITY HONESTY: Sector leadership is NOT stock relative strength against NIFTY 50. Stock benchmark relative strength is a different filter, not a sector-ranking implementation. Explain the difference and require an explicit choice before substituting. Use benchmarkClose and benchmarkEma for the selected index itself. To require a bullish NIFTY 50, compare benchmarkClose against benchmarkEma with the SAME benchmark setting on both operands. An explicitly selected sector index can confirm that sector trend; this does not rank sectors or automatically map each stock to a sector. Respect each catalog field's supported frames even in an intraday strategy; a daily-only relative-strength filter uses completed daily candles, not intraday candles. Ask which interval when the intended meaning is unclear. openingRangeHigh/openingRangeLow are catalog operands: their period is MINUTES from 09:15 IST, not a rolling candle count; they wait for the whole opening window. signalRanking optionally prioritizes competing buys: instrumentId preserves existing order, turnover uses completed signal candle close times volume, relativeVolume uses signal candle volume divided by the previous 20 candles. Ranking is not a profitability forecast and does not rank sectors. Preserve existing settings unless the user requests a change.
Before asking about capital, risk or entry settings, explain any unsupported trading direction and resolve it with the user. Once a long-only adaptation is explicitly accepted, carry that decision forward instead of asking again. SHORT opens a short position; SELL closes an existing long. This engine cannot open shorts. If the user requests both, explain the unsupported short branch and ask whether to prepare a long-only adaptation or leave the idea unchanged. Never silently remove or convert SHORT to SELL. 'Bullish', 'leading', Buy Level, SL Level and targets need measurable definitions or explicit acceptance of explained alternatives.

status=clarify when a requested change needs an unanswered decision. Ask only those decisions. status=unsupported identifies a requirement outside the supported engine. status=explain answers an explanation-only request without making changes. status=ready only if requested changes are fully specified or the user explicitly authorized a suggestion/default.
requirements lists only the explicit requested changes and decisions already confirmed by the user, never your guesses. Existing unrelated settings can be retained without asking. An existing setting does NOT answer a new ambiguous request to change it.
riskFeatures records which optional risk features this request explicitly sets, removes, or leaves unchanged. 'Sell half at one target and the rest later' sets partialExits; 'move stop to entry after the first sale' sets breakeven; 'no trailing' removes trailing. These flags are checked against the generated settings.
ENGINE COMPARISON SEMANTICS:
- Ordinary gt/gte/lt/lte comparisons support DIFFERENT timeframes: daily close versus weekly EMA5 is valid. Cadence does not restrict operand timeframes. Only crossAbove/crossBelow between two series need the same timeframe. Never claim daily-vs-weekly comparisons are incompatible.
- With rightType="value", only value is active. A stored right="ema5" and rightFrame="1w" are inactive UI selections; close <= 0 does not compare to EMA5. A suggested repair can switch rightType to indicator, keeping that weekly comparator, with the assumption disclosed.
- An explicit request to suggest a minimal conflict repair authorizes a proposal with disclosed assumptions. Return ready when this is enough; do not require confirmation of an invented engine restriction.
CRITICAL EXAMPLES:
- 'Enter at 100, SL96, sell some at 2R and the rest at4R' with no existing partial-exit plan: clarify whether prices are exact or illustrative AND ask how much to sell. Do not assume 50/50. Do not silently turn 96 into a 4% stop.
- 'For illustration, 100 entry with a reusable 4% stop; sell half at2R and rest at4R' is specified; do not ask for amounts again.
- 'Trail after T1' without a saved delayed trailing distance: ask the distance. Do not assume 1R.
- 'Make risk 0.5%' with a current draft: ready; preserve unrelated settings, do not ask for entry conditions.
- 'Explain risk' asks for an explanation, not a proposal.
- A risk-only request works even with empty buy/sell groups. Never ask the user to complete those to configure risk.
Supported fields and focus are below. These are capabilities, NOT permission to choose omitted values. No market observations are supplied.
${capabilityContext}
Before returning ready, check all three: (a) any example-vs-actual-price ambiguity, (b) any missing allocation for partial sales, (c) any missing stop activation or trailing distance. Ask about unresolved ones only. Never silently fill these gaps. For reversible missing allocations or trailing distance, you may offer an explained recommended option; use it only after the user chooses it or explicitly asks you to suggest that setting. Price meaning ambiguities always need an explicit answer.`;
  const raw = await generate(instruction, input, geminiSchema(zodToJsonSchema(strategyIntentSchema, { $refStrategy: 'none' })), signal,attachments);
  const parsed = strategyIntentSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(422, 'AI_INVALID_CLARIFICATION', 'The assistant could not resolve this request clearly. Please describe the missing detail or retry; your settings are unchanged.');
  const intent = parsed.data;
  // Only a direct user request grants permission, never model text or attachment instructions.
  let prompt = '';
  try { const context = JSON.parse(input) as {request?:unknown}; if(typeof context.request==='string') prompt=context.request; } catch { /* No structured request: do not infer permission. */ }
  const delegated = delegatedDraftChoices(prompt);
  if (intent.status === 'clarify' && !intent.blockers.length && delegated.length) {
    const questions = remainingDraftQuestions(intent.questions, delegated);
    if (questions.length < intent.questions.length) {
      return {...intent,questions,status:questions.length?'clarify' as const:'ready' as const,
        requirements:[...intent.requirements,`User delegates these technical draft choices: ${delegated.join(', ')}. Choose supported rules and disclose them for review.`].slice(-16)};
    }
  }
  return intent;
}
