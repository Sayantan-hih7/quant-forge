import { z } from 'zod';
import { allowedFrames, metrics } from '../config/metrics';
import type { Metric, Timeframe } from '../types';
const metric = z.enum(Object.keys(metrics) as [Metric, ...Metric[]]);
const frame = z.enum(['latest', '1m', '5m', '15m', '4h', '1d', '1w', '1mo', '1q']);
const numeric = z.number({ invalid_type_error: 'Enter a number' }).finite();
export const ruleSchema = z.object({
  name: z.string().trim().min(3, 'Use at least 3 characters').max(60),
  description: z.string().trim().max(200),
  tier: z.enum(['base', 'tactical']), horizon: z.enum(['intraday', 'swing', 'long-term']),
  logic: z.enum(['AND', 'OR']), side: z.enum(['BUY', 'SELL']), cadence: z.enum(['1m', '5m', '15m', 'daily']),
  groups: z.array(z.object({ logic: z.enum(['AND', 'OR']), conditions: z.array(z.object({
    left: metric, leftFrame: frame, operator: z.enum(['gt', 'gte', 'lt', 'lte', 'crossAbove', 'crossBelow', 'within']),
    rightType: z.enum(['value', 'indicator']), value: numeric, right: metric, rightFrame: frame,
    multiplier: numeric.positive('Multiplier must be positive').max(100), tolerance: numeric.min(0).max(100),
  })).min(1, 'Add at least one condition').max(12) })).min(1, 'Add at least one group').max(6),
}).superRefine((rule, context) => {
  rule.groups.forEach((group, gi) => group.conditions.forEach((condition, ci) => {
    const error = (field: string, message: string) => context.addIssue({ code: 'custom', path: ['groups', gi, 'conditions', ci, field], message });
    const checkFrame = (metricId: Metric, timeframe: Timeframe, field: string) => {
      if (!allowedFrames(metricId, rule.tier).includes(timeframe) || (rule.tier === 'base' && !metrics[metricId].base)) error(field, 'Choose a supported timeframe for this tier and indicator');
    };
    checkFrame(condition.left, condition.leftFrame, 'leftFrame');
    if (condition.rightType === 'indicator') {
      checkFrame(condition.right, condition.rightFrame, 'rightFrame');
      if (metrics[condition.left].unit !== metrics[condition.right].unit) error('right', 'Compare indicators with matching units');
    }
    if (condition.operator.startsWith('cross')) {
      if (condition.rightType !== 'indicator') error('rightType', 'A crossover requires another indicator');
      else if (condition.leftFrame !== condition.rightFrame) error('rightFrame', 'Use the same timeframe for a crossover');
    }
    if (condition.operator === 'within' && condition.rightType !== 'indicator') error('rightType', 'Choose an indicator for a relative-distance rule');
  }));
});
