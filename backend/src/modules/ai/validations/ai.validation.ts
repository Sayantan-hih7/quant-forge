import { z } from 'zod';
import { monthlyCatalog, tradingCatalog } from '../config/rule-catalog.js';
import { riskSchema } from '../../strategies/validations/strategy.validation.js';

const number = z.number().finite();
const logic = z.enum(['AND', 'OR']);
const monthlyField = z.enum(Object.keys(monthlyCatalog) as [string, ...string[]]);
const tradingField = z.enum(Object.keys(tradingCatalog) as [string, ...string[]]);
export const monthlyConditionSchema = z.object({
  field: monthlyField,
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', 'crossAbove', 'crossBelow', 'increasing', 'decreasing', 'within', 'aboveBy', 'belowBy', 'is', 'isNot', 'in', 'notIn']),
  operand: z.enum(['value', 'field']), value: number, upper: number, compareField: monthlyField,
  multiplier: number.positive().max(100), distance: number.min(0).max(100), lookback: number.int().min(1).max(24),
  choices: z.array(z.string().min(1).max(100)).max(30),
}).strict();
export const monthlyProposalSchema = z.object({ logic, conditions: z.array(monthlyConditionSchema).min(1).max(12) }).strict();
const tradingConditionSchema = z.object({
  left: tradingField, leftFrame: z.enum(['latest', '1m', '5m', '15m', '4h', '1d', '1w', '1mo', '1q']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'crossAbove', 'crossBelow', 'within']), rightType: z.enum(['value', 'indicator']),
  value: number, right: tradingField, rightFrame: z.enum(['latest', '1m', '5m', '15m', '4h', '1d', '1w', '1mo', '1q']),
  multiplier: number.positive().max(100), tolerance: number.min(0).max(100),
}).strict();
const tradingSideSchema = z.object({ logic, groups: z.array(z.object({ logic, conditions: z.array(tradingConditionSchema).min(1).max(12) }).strict()).min(1).max(6) }).strict();
export const tradingProposalSchema = z.object({
  name: z.string().trim().min(3).max(50), horizon: z.enum(['intraday', 'swing', 'long-term']), cadence: z.enum(['1m', '5m', '15m', 'daily']),
  entry: tradingSideSchema, exit: tradingSideSchema, risk: riskSchema,
}).strict();
export const aiResponseSchema = (scope: 'monthly' | 'strategy') => z.object({
  message: z.string().trim().min(1).max(3000), assumptions: z.array(z.string().max(300)).max(8),
  proposal: (scope === 'monthly' ? monthlyProposalSchema : tradingProposalSchema).nullable(),
}).strict();
export const aiRequestSchema = z.object({
  scope: z.enum(['monthly', 'strategy']), prompt: z.string().trim().min(3).max(1200),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }).strict()).max(12).default([]),
  currentDraft: z.record(z.unknown()).optional(),
}).strict().refine(value => JSON.stringify(value.currentDraft ?? {}).length <= 32_000, 'The rule draft is too large');
export type AiRequest = z.infer<typeof aiRequestSchema>;
export type MonthlyProposal = z.infer<typeof monthlyProposalSchema>;
export type TradingProposal = z.infer<typeof tradingProposalSchema>;
