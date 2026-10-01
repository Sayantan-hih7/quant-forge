import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';

const rupees = z.number().finite().positive().max(10_000_000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use at most two decimal places for rupees');
const target = z.object({ basis: z.enum(['price', 'percent']), value: z.number().finite().positive().max(10_000_000), sellPercent: z.number().int().min(1).max(100) }).strict();
/** Protection attached to a manual buy. Every manual buy has a stop-loss: positions are never unprotected. */
export const protectionSchema = z.object({
  stop: z.object({ mode: z.enum(['price', 'percent', 'atr', 'trailing']), value: z.number().finite().positive().max(10_000_000) }).strict(),
  targets: z.array(target).max(3).default([]),
  breakeven: z.enum(['off', 'target1', 'profit1R']).default('off'),
  trailing: z.enum(['off', 'afterTarget1', 'after1R']).default('off'),
}).strict().superRefine((p, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (p.stop.mode === 'percent' && (p.stop.value < 0.1 || p.stop.value > 25)) issue(['stop', 'value'], 'Use a stop-loss between 0.1% and 25%');
  if (p.stop.mode === 'trailing' && (p.stop.value < 0.1 || p.stop.value > 25)) issue(['stop', 'value'], 'Use a trailing distance between 0.1% and 25%');
  if (p.stop.mode === 'atr' && (p.stop.value < 0.5 || p.stop.value > 10)) issue(['stop', 'value'], 'Use 0.5× to 10× ATR');
  if (p.targets.length) {
    if (p.targets.some(t => t.basis !== p.targets[0].basis)) issue(['targets'], 'Use the same unit (price or %) for every target');
    if (p.targets.reduce((sum, t) => sum + t.sellPercent, 0) !== 100) issue(['targets'], 'Target sell percentages must add up to 100%');
    p.targets.forEach((t, i) => { if (i && t.value <= p.targets[i - 1].value) issue(['targets', i, 'value'], 'Each target must be higher than the previous one'); });
  }
  if ((p.breakeven === 'target1' || p.trailing === 'afterTarget1') && p.targets.length < 2) issue(['breakeven'], 'Moving the stop after Target 1 needs at least two targets (Target 1 sells only part of the position)');
  if (p.stop.mode === 'trailing' && p.trailing !== 'off') issue(['trailing'], 'The stop already trails; turn off the extra trailing option');
});
const product = z.enum(['delivery', 'intraday']);
export const manualOrderSchema = z.object({
  id: z.string().uuid(), instrumentId: instrumentIdSchema, side: z.enum(['BUY', 'SELL']), product: product.default('delivery'),
  quantity: z.number().int().min(1).max(1_000_000),
  orderType: z.enum(['market', 'limit', 'stop']).default('market'), limitPrice: rupees.optional(), triggerPrice: rupees.optional(),
  protection: protectionSchema.optional(),
}).strict().superRefine((o, ctx) => {
  if (o.orderType === 'limit' && o.limitPrice === undefined) ctx.addIssue({ code: 'custom', path: ['limitPrice'], message: 'Enter a limit price' });
  if (o.orderType === 'stop' && o.triggerPrice === undefined) ctx.addIssue({ code: 'custom', path: ['triggerPrice'], message: 'Enter a trigger price' });
  if (o.side === 'BUY' && !o.protection) ctx.addIssue({ code: 'custom', path: ['protection'], message: 'Set a stop-loss for every buy' });
});
const condition = z.object({ left: z.string().min(1).max(60) }).passthrough();
export const ruleGroupsSchema = z.object({
  logic: z.enum(['AND', 'OR']).default('AND'),
  groups: z.array(z.object({ logic: z.enum(['AND', 'OR']), conditions: z.array(condition).min(1).max(12) }).passthrough()).min(1).max(6),
}).strict();
export const manualTriggerSchema = z.object({
  instrumentId: instrumentIdSchema, side: z.enum(['BUY', 'SELL']), product: product.default('delivery'), quantity: z.number().int().min(1).max(1_000_000),
  cadence: z.enum(['1m', '5m', '15m', 'daily']), rule: ruleGroupsSchema, validity: z.enum(['day', '7d', '30d', '90d']).default('day'),
  protection: protectionSchema.optional(),
}).strict().superRefine((t, ctx) => {
  if (t.side === 'BUY' && !t.protection) ctx.addIssue({ code: 'custom', path: ['protection'], message: 'Set a stop-loss for every buy' });
  if (t.product === 'intraday' && t.cadence === 'daily') ctx.addIssue({ code: 'custom', path: ['cadence'], message: 'Intraday conditions need 1, 5 or 15-minute candles' });
});
export const manualAccountSchema = z.object({ capital: z.number().int().min(10_000).max(100_000_000) }).strict();
export type Protection = z.infer<typeof protectionSchema>;
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;
export type ManualTriggerInput = z.infer<typeof manualTriggerSchema>;
