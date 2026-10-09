/** Explicit delegation of technical draft choices is an answer, not missing input.
 * Restricted to reversible entry/stop/target design; never execution or capability gaps.
 */
const choices = new Set(['entry_trigger','buy_trigger','stop_loss_method','stop_method','profit_target','target_structure']);
const delegation = /^(?:please\s+)?(?:do whatever (?:is |you think is )?(?:good|best)|(?:you|ai) (?:decide|choose)|(?:decide|choose|suggest|recommend) for me|use (?:your |the )?recommended defaults)(?:\b|[.!])/i;
export function delegatedDraftChoices(prompt: string): string[] {
  const result = new Set<string>();
  const answers = [...prompt.matchAll(/\[([a-z_]+)\]\s*([^\n]+)/g)];
  for (const [, id, answer] of answers) if (choices.has(id) && delegation.test(answer.trim())) result.add(id);
  if (!answers.length && delegation.test(prompt.trim())) for (const id of choices) result.add(id);
  return [...result];
}
export function remainingDraftQuestions<T extends {id:string}>(questions:T[], delegated:string[]) {
  return questions.filter(q=>!delegated.includes(q.id));
}
export const delegationGuidance = `EXPLICIT DELEGATION: 'do whatever is good', 'you decide', 'choose for me' and similar answers authorize you to choose reversible technical DRAFT settings. They are valid answers, not unresolved ambiguity. Specify concrete supported entry, stop and target rules, explain why each fits the stated research goal, and list your choices as assumptions for review. Preserve confirmed capital, risk, horizon and targets (a confirmed 1:2 target stays 2R). Do not keep returning the same technical questionnaire. For a falling-market request in an accepted long-only plan, consider a measurable benchmark trend filter that keeps new buys off while the market is weak; explain that no trade can be the outcome. Do not assume the user wants dip buying, promise the best strategy, claim current market knowledge, revive rejected shorts or start trading. Unsupported requirements, conflicting explicit values and unclear actual-vs-example order prices still need resolution. Delegation does not authorize replacing another strategy, saving, starting a session or placing orders.`;
