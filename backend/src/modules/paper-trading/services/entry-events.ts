import type { EvaluationResult } from '../../engine/services/engine.service.js';

type Check = EvaluationResult['checks'][number];
type Group = { logic: string; conditions: unknown[] };
const combine = (values: (boolean | null)[], logic: string): boolean | null => logic === 'AND'
  ? values.includes(false) ? false : values.includes(null) ? null : true
  : values.includes(true) ? true : values.includes(null) ? null : false;

/** Preserve AND/OR semantics: consuming one crossover must not disable another OR branch. */
export function freshEntry(rule: Record<string, unknown>, evaluation: EvaluationResult, consumed: Set<string>) {
  const checks = evaluation.checks.map(check => check.eventKey && consumed.has(check.eventKey)
    ? { ...check, matched: false, reason: 'This crossover already triggered an entry' } : check);
  let offset = 0;
  const groups = (rule.groups as Group[]).map(group => {
    const own = checks.slice(offset, offset + group.conditions.length); offset += group.conditions.length;
    return { checks: own, matched: combine(own.map(check => check.matched), group.logic) };
  });
  const matched = combine(groups.map(group => group.matched), String(rule.logic));
  const eventKeys = matched === true ? groups.filter(group => group.matched === true)
    .flatMap(group => group.checks.filter((check: Check) => check.matched === true && check.eventKey).map(check => check.eventKey!)) : [];
  const status: EvaluationResult['status'] = matched === true ? 'qualified' : matched === false ? 'rejected' : 'unavailable';
  return { evaluation: { ...evaluation, checks, matched, status }, eventKeys: [...new Set(eventKeys)] };
}
