import {attachmentsSchema} from './attachment.validation.js';
import { calculationSettingsSchema } from '../../../shared/calculation-settings-schema.js';
import { z } from 'zod';
import { monthlyCatalog, tradingCatalog } from '../config/rule-catalog.js';
import { riskSchema } from '../../strategies/validations/strategy.validation.js';

const number = z.number().finite();
const logic = z.enum(['AND', 'OR']);
const monthlyField = z.enum(Object.keys(monthlyCatalog) as [string, ...string[]]);
const tradingField = z.enum(Object.keys(tradingCatalog) as [string, ...string[]]);
export const monthlyConditionSchema = z.object({
  field: monthlyField,
  settings: calculationSettingsSchema.optional(), compareSettings: calculationSettingsSchema.optional(),
  period: number.int().min(2).max(500).optional(), offset: number.int().min(0).max(120).optional(),
  comparePeriod: number.int().min(2).max(500).optional(), compareOffset: number.int().min(0).max(120).optional(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', 'crossAbove', 'crossBelow', 'increasing', 'decreasing', 'within', 'aboveBy', 'belowBy', 'is', 'isNot', 'in', 'notIn']),
  operand: z.enum(['value', 'field']), value: number, upper: number, compareField: monthlyField,
  multiplier: number.positive().max(100), distance: number.min(0).max(100), lookback: number.int().min(1).max(24),
  choices: z.array(z.string().min(1).max(100)).max(30),
}).strict();
export const monthlyProposalSchema = z.object({ logic, conditions: z.array(monthlyConditionSchema).min(1).max(12) }).strict();
const tradingConditionSchema = z.object({
  leftSettings: calculationSettingsSchema.optional(), rightSettings: calculationSettingsSchema.optional(),
  leftPeriod: number.int().min(2).max(500).optional(), leftOffset: number.int().min(0).max(120).optional(),
  rightPeriod: number.int().min(2).max(500).optional(), rightOffset: number.int().min(0).max(120).optional(),
  left: tradingField, leftFrame: z.enum(['latest', '1m', '5m', '15m', '4h', '1d', '1w', '1mo', '1q']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', 'crossAbove', 'crossBelow', 'increasing', 'decreasing', 'within', 'aboveBy', 'belowBy']), rightType: z.enum(['value', 'indicator']),
  value: number, upper: number.optional(), lookback: number.int().min(1).max(120).optional(),
  right: tradingField, rightFrame: z.enum(['latest', '1m', '5m', '15m', '4h', '1d', '1w', '1mo', '1q']),
  multiplier: number.positive().max(100), tolerance: number.min(0).max(100),
}).strict();
const tradingSideSchema = z.object({ enabled: z.boolean().optional(), logic, groups: z.array(z.object({ logic, conditions: z.array(tradingConditionSchema).min(1).max(12) }).strict()).max(6) }).strict();
export const tradingProposalSchema = z.object({
  name: z.string().trim().min(3).max(50), horizon: z.enum(['intraday', 'swing', 'long-term']), cadence: z.enum(['1m', '5m', '15m', 'daily']),
  entry: tradingSideSchema, exit: tradingSideSchema, risk: riskSchema,
}).strict().superRefine((plan,ctx) => {
  if (plan.entry.enabled === false || !plan.entry.groups.length) ctx.addIssue({ code:'custom',path:['entry'],message:'Buy conditions are required.' });
  if (plan.exit.enabled !== false && !plan.exit.groups.length) ctx.addIssue({ code:'custom',path:['exit'],message:'Choose sell conditions or stops and targets only.' });
});
export const riskProposalSchema = z.object({ risk: riskSchema }).strict();
export const aiQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  question: z.string().trim().min(1).max(300),
  reason: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(120)).max(4),
  recommendedOption: z.string().trim().min(1).max(120).nullable().optional(),
  recommendationReason: z.string().trim().min(1).max(300).optional(),
  allowRecommendedDefault: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.recommendedOption && !value.options.includes(value.recommendedOption)) ctx.addIssue({code:'custom',path:['recommendedOption'],message:'Recommendation must match a supplied option.'});
  if (value.allowRecommendedDefault && (!value.recommendedOption || !value.recommendationReason)) ctx.addIssue({code:'custom',message:'A skippable question needs an explained recommended option.'});
});
export const aiQuestionsSchema = z.array(aiQuestionSchema).max(3).superRefine((questions,ctx)=>{
  if(new Set(questions.map(q=>q.id)).size!==questions.length)ctx.addIssue({code:'custom',message:'Question IDs must be unique.'});
});
export const aiExampleSchema = z.object({
  entry: number.positive().max(10000000).nullable(),
  atr: number.positive().max(10000000).nullable(),
}).strict();
export const aiDialogueSchema = z.object({
  questions: aiQuestionsSchema.default([]),
  blockers: z.array(z.string().trim().min(1).max(400)).max(5).default([]),
  example: aiExampleSchema.nullable().default(null),
});
export const strategyIntentSchema = z.object({
  status: z.enum(['clarify', 'unsupported', 'explain', 'ready']),
  message: z.string().trim().min(1).max(3000),
  questions: aiQuestionsSchema,
  blockers: z.array(z.string().trim().min(1).max(400)).max(5),
  assumptions: z.array(z.string().max(300)).max(8),
  requirements: z.array(z.string().trim().min(1).max(400)).max(16),
  riskFeatures: z.object({ partialExits: z.enum(['keep', 'set', 'remove']), breakeven: z.enum(['keep', 'set', 'remove']), trailing: z.enum(['keep', 'set', 'remove']) }).strict(),
  example: aiExampleSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'ready' && (value.questions.length || value.blockers.length)) ctx.addIssue({ code: 'custom', message: 'Ready requires all blocking questions resolved.' });
  if (value.status === 'clarify' && !value.questions.length) ctx.addIssue({ code: 'custom', message: 'Clarify requires at least one specific question.' });
  if (value.status === 'unsupported' && !value.blockers.length) ctx.addIssue({ code: 'custom', message: 'Unsupported requires a specific missing capability.' });
});
export const aiResponseSchema = (scope: 'monthly' | 'strategy', focus?: 'risk') => {
  const base = z.object({
  message: z.string().trim().min(1).max(3000), assumptions: z.array(z.string().max(300)).max(8),
  proposal: (scope === 'monthly' ? monthlyProposalSchema : focus === 'risk' ? riskProposalSchema : tradingProposalSchema).nullable(),
  }).strict();
  return base.extend(aiDialogueSchema.shape);
};
export const aiRequestSchema = z.object({
  attachments: attachmentsSchema.optional(),
  scope: z.enum(['monthly', 'strategy']), prompt: z.string().trim().min(3).max(1200),
  focus: z.literal('risk').optional(),
  example: aiExampleSchema.optional(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }).strict()).max(12).default([]),
  currentDraft: z.record(z.unknown()).optional(),
}).strict().refine(value => JSON.stringify(value.currentDraft ?? {}).length <= 32_000, 'The rule draft is too large')
  .refine(value => !value.focus || value.scope === 'strategy' && !!value.currentDraft, 'Risk assistance requires the current strategy draft')
  .refine(value => !value.example || value.scope === 'strategy', 'Examples belong to strategy assistance');
export type AiRequest = z.infer<typeof aiRequestSchema>;
export type MonthlyProposal = z.infer<typeof monthlyProposalSchema>;
export type TradingProposal = z.infer<typeof tradingProposalSchema>;
