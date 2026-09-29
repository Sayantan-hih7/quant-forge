import { z } from 'zod';
import { strategySchema } from './strategy.validation.js';
const number=z.number().finite();
const condition=z.object({
  left:z.string().min(1).max(80),leftFrame:z.string().min(1).max(12),operator:z.enum(['gt','gte','lt','lte','eq','neq','between','notBetween','crossAbove','crossBelow','increasing','decreasing','within','aboveBy','belowBy']),
  rightType:z.enum(['value','indicator']),value:number,right:z.string().max(80),rightFrame:z.string().max(12),
  leftPeriod:number.optional(),rightPeriod:number.optional(),leftOffset:number.optional(),rightOffset:number.optional(),
  upper:number.optional(),lookback:number.optional(),multiplier:number.optional(),tolerance:number.optional(),
}).passthrough();
const rule=z.object({enabled:z.boolean().optional(),logic:z.enum(['AND','OR']),cadence:z.enum(['1m','5m','15m','daily']),
  groups:z.array(z.object({logic:z.enum(['AND','OR']),conditions:z.array(condition).max(12)})).max(6),
}).passthrough();
export const ruleReviewRequestSchema=strategySchema.extend({entry:rule,exit:rule});
