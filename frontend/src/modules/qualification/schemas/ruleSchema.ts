import { fieldParameterError, ruleFields } from '../config/ruleFields';
import { z } from 'zod';
import { allowedFrames, metrics } from '../config/metrics';
import type { Metric, Timeframe } from '../types';
const metric = z.enum(Object.keys(metrics) as [Metric, ...Metric[]]);
const frame = z.enum(['latest', '1m', '5m', '15m', '4h', '1d', '1w', '1mo', '1q']);
const numeric = z.number({ invalid_type_error: 'Enter a number' }).finite();
export const ruleSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(3, 'Use at least 3 characters').max(60),
  description: z.string().trim().max(200),
  tier: z.enum(['base', 'tactical']), horizon: z.enum(['intraday', 'swing', 'long-term']),
  logic: z.enum(['AND', 'OR']), side: z.enum(['BUY', 'SELL']), cadence: z.enum(['1m', '5m', '15m', 'daily']),
  groups: z.array(z.object({ logic: z.enum(['AND', 'OR']), conditions: z.array(z.object({
    leftPeriod: numeric.int().min(2).max(500).optional(), leftOffset: numeric.int().min(0).max(120).optional(),
    rightPeriod: numeric.int().min(2).max(500).optional(), rightOffset: numeric.int().min(0).max(120).optional(),
    left: metric, leftFrame: frame, operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', 'crossAbove', 'crossBelow', 'increasing', 'decreasing', 'within', 'aboveBy', 'belowBy']),
    rightType: z.enum(['value', 'indicator']), value: numeric, upper: numeric.optional(), lookback: numeric.int().min(1).max(120).optional(),
    right: metric, rightFrame: frame,
    multiplier: numeric.positive('Multiplier must be positive').max(100), tolerance: numeric.min(0).max(100),
  })).min(1, 'Add at least one condition').max(12) })).max(6),
}).superRefine((rule, context) => {
  if (rule.enabled === false) {
    if (rule.side !== 'SELL' || rule.tier !== 'tactical') context.addIssue({ code: 'custom', path: ['enabled'], message: 'Only sell conditions can be disabled.' });
    return;
  }
  if (!rule.groups.length) context.addIssue({ code: 'custom', path: ['groups'], message: 'Add at least one group.' });
  rule.groups.forEach((group, gi) => group.conditions.forEach((condition, ci) => {
    const error = (field: string, message: string) => context.addIssue({ code: 'custom', path: ['groups', gi, 'conditions', ci, field], message });
    const checkFrame = (metricId: Metric, timeframe: Timeframe, field: string) => {
      if (!allowedFrames(metricId, rule.tier).includes(timeframe) || (rule.tier === 'base' && !metrics[metricId].base)) error(field, 'Choose a supported timeframe for this tier and indicator');
    };
    const leftError = fieldParameterError(condition.left, condition.leftPeriod, condition.leftOffset);
    if (leftError) error('leftPeriod', leftError);
    checkFrame(condition.left, condition.leftFrame, 'leftFrame');
    if (condition.rightType === 'indicator') {
      const rightError = fieldParameterError(condition.right, condition.rightPeriod, condition.rightOffset);
      if (rightError) error('rightPeriod', rightError);
      checkFrame(condition.right, condition.rightFrame, 'rightFrame');
      if (metrics[condition.left].unit !== metrics[condition.right].unit) error('right', 'Compare indicators with matching units');
    }
    if (condition.operator.startsWith('cross')) {
      if (!['candles', 'dailyReports'].includes(ruleFields[condition.left]?.source)) error('left', 'A crossover requires a historical series');
      if (condition.rightType === 'indicator' && !['candles', 'dailyReports'].includes(ruleFields[condition.right]?.source)) error('right', 'Compare a crossover with a historical series or a fixed value');
      if (condition.rightType === 'indicator' && condition.leftFrame !== condition.rightFrame) error('rightFrame', 'Use the same timeframe for a crossover');
    }
    if (['within', 'aboveBy', 'belowBy'].includes(condition.operator) && condition.rightType !== 'indicator') error('rightType', 'Choose an indicator for a relative-distance rule');
    if (['between', 'notBetween'].includes(condition.operator)) {
      if (condition.rightType !== 'value') error('rightType', 'Use a fixed lower and upper value for a range rule');
      if (condition.upper === undefined) error('upper', 'Enter an upper bound');
      else if (condition.upper <= condition.value) error('upper', 'The upper bound must be greater than the lower bound');
    }
    if (['increasing', 'decreasing'].includes(condition.operator) && (condition.lookback === undefined || condition.lookback < 2)) error('lookback', 'Use at least 2 candles');
  }));
});
