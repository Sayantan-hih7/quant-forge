import { zodToJsonSchema } from 'zod-to-json-schema';
import { AppError } from '../../../shared/errors.js';
import { geminiSchema } from '../providers/gemini-schema.js';
import { generateGemini } from '../providers/gemini.provider.js';
import { strategyIntentSchema } from '../validations/ai.validation.js';
import { strategyGuidance } from '../config/strategy-guidance.js';

/** Resolve intent before exposing a draft schema full of fields the model might guess. */
export async function clarifyStrategy(capabilityContext: string, input: string, signal?: AbortSignal, generate = generateGemini) {
  const instruction = `You are the clarification stage of a strategy builder. Do not generate a strategy or choose trade settings in this stage.
Read the user's latest request together with the conversation and current draft. Return the intent schema.
${strategyGuidance}
status=clarify when a requested change needs an unanswered decision. Ask only those decisions. status=unsupported identifies a requirement outside the supported engine. status=explain answers an explanation-only request without making changes. status=ready only if requested changes are fully specified or the user explicitly authorized a suggestion/default.
requirements lists only the explicit requested changes and decisions already confirmed by the user, never your guesses. Existing unrelated settings can be retained without asking. An existing setting does NOT answer a new ambiguous request to change it.
riskFeatures records which optional risk features this request explicitly sets, removes, or leaves unchanged. 'Sell half at one target and the rest later' sets partialExits; 'move stop to entry after the first sale' sets breakeven; 'no trailing' removes trailing. These flags are checked against the generated settings.
CRITICAL EXAMPLES:
- 'Enter at 100, SL96, sell some at 2R and the rest at4R' with no existing partial-exit plan: clarify whether prices are exact or illustrative AND ask how much to sell. Do not assume 50/50. Do not silently turn 96 into a 4% stop.
- 'For illustration, 100 entry with a reusable 4% stop; sell half at2R and rest at4R' is specified; do not ask for amounts again.
- 'Trail after T1' without a saved delayed trailing distance: ask the distance. Do not assume 1R.
- 'Make risk 0.5%' with a current draft: ready; preserve unrelated settings, do not ask for entry conditions.
- 'Explain risk' asks for an explanation, not a proposal.
- A risk-only request works even with empty buy/sell groups. Never ask the user to complete those to configure risk.
Supported fields and focus are below. These are capabilities, NOT permission to choose omitted values. No market observations are supplied.
${capabilityContext}
Before returning ready, check all three: (a) any example-vs-actual-price ambiguity, (b) any missing allocation for partial sales, (c) any missing stop activation or trailing distance. Ask about unresolved ones only. Never fill these gaps with assumptions.`;
  const raw = await generate(instruction, input, geminiSchema(zodToJsonSchema(strategyIntentSchema, { $refStrategy: 'none' })), signal);
  const parsed = strategyIntentSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(422, 'AI_INVALID_CLARIFICATION', 'The assistant could not resolve this request clearly. Please describe the missing detail or retry; your settings are unchanged.');
  return parsed.data;
}
