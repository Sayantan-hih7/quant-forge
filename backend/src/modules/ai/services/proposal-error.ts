import { ZodError, type ZodIssue } from 'zod';
import { AppError } from '../../../shared/errors.js';

const labels: Record<string, string> = {
  period: 'Indicator period', offset: 'Earlier monthly candle', comparePeriod: 'Compared indicator period', compareOffset: 'Earlier comparison candle',
  leftPeriod: 'Indicator period', leftOffset: 'Earlier candle', rightPeriod: 'Compared indicator period', rightOffset: 'Earlier comparison candle',
  name: 'Strategy name', horizon: 'Trading horizon', cadence: 'Check frequency',
  initialCapital: 'Paper capital', riskPercent: 'Risk per trade', maxPositions: 'Maximum positions',
  timeframe: 'Candle interval', stopMode: 'Initial stop method', stopPercent: 'Stop percentage',
  maxStopPercent: 'Maximum initial stop distance',
  stopValue: 'Stop price or distance', entryOrderType: 'Buy order type', entryLimitPrice: 'Buy limit',
  atrPeriod: 'ATR period', atrMultiplier: 'ATR multiplier', targetR: 'Single profit target',
  overnight: 'Overnight holding', exitTargets: 'Partial profit targets', closePercent: 'Exit allocation',
  basis: 'Target unit', profitPercent: 'Target percentage gain', value: 'Comparison or target value',
  breakevenAfterTarget1: 'Move stop to entry', stopManagement: 'Stop adjustments',
  breakeven: 'Move stop to entry', trailing: 'Trailing stop', trigger: 'Stop activation',
  at: 'Stop activation level', distanceR: 'Trailing distance', slippagePercent: 'Slippage estimate', feePercent: 'Fee estimate',
  left: 'Rule field', right: 'Comparison field', leftFrame: 'Rule timeframe', rightFrame: 'Comparison timeframe',
  rightType: 'Comparison type', operator: 'Rule operator', multiplier: 'Comparison multiplier',
  tolerance: 'Distance percentage', groups: 'Condition groups', conditions: 'Conditions', logic: 'AND/OR logic',
};

function describe(issue: ZodIssue) {
  const field = [...issue.path].reverse().find(part => typeof part === 'string' && labels[part]);
  const name = field ? labels[field] : 'AI response';
  const side = issue.path.includes('entry') ? 'Buy rule: ' : issue.path.includes('exit') ? 'Sell rule: ' : '';
  // Never echo arbitrary model keys, invalid enum values or raw provider output.
  const reason = issue.code === 'invalid_enum_value' ? 'choose a supported option.'
    : issue.code === 'invalid_type' ? `a valid ${issue.expected} is required.`
    : issue.code === 'unrecognized_keys' ? 'contains unsupported settings.'
    : ['too_small', 'too_big', 'custom'].includes(issue.code) ? issue.message
    : 'does not match the supported format.';
  return `${side}${name} — ${reason}`;
}

/** Keep failed drafts unapplied, but name the failed control instead of blaming the prompt. */
export function invalidProposalError(error: ZodError | AppError) {
  const details = error instanceof ZodError ? [...new Set(error.issues.map(describe))].slice(0, 3).join(' ')
    : error.code === 'AI_RULE_CONSTRAINT' ? error.message
    : error.code === 'AI_MISSING_SETTING' ? 'A requested partial exit or stop adjustment was missing from the generated settings.'
    : error.code === 'AI_CHANGED_SETTING' ? 'The generated settings changed an exit or stop adjustment you asked to keep.'
    : 'A generated rule used an unsupported field, timeframe or comparison.';
  return new AppError(422, 'AI_INVALID_PROPOSAL', `The assistant's draft failed validation after a correction attempt. ${details} Your draft is unchanged. Ask me to revise the affected condition using a supported option, or edit that condition in the manual builder. No rules were saved or trades started.`);
}
