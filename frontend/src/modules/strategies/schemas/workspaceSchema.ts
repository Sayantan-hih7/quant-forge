import { z } from 'zod';
import { horizonTimeframes, tradingTemplates } from '../config/tradingTemplates';
export const baseRulesSchema = z.object({
  name: z.string().trim().min(3, 'Use at least 3 characters').max(60, 'Use no more than 60 characters'),
  source: z.enum(['NSE 500', 'NSE 200']),
  trend: z.enum(['above-ema50', 'above-ema200', 'any']),
  minMomentum: z.number({ invalid_type_error: 'Enter a six-month return threshold' }).min(-100).max(100),
  minTurnover: z.number({ invalid_type_error: 'Enter a daily turnover threshold' }).min(0).max(50000),
});
export type BaseRulesValues = z.infer<typeof baseRulesSchema>;
export const tradingLayerSchema = z.object({
  name: z.string().trim().min(3, 'Use at least 3 characters').max(60),
  templateId: z.string().refine((id) => tradingTemplates.some((template) => template.id === id), 'Choose a strategy template'),
  horizon: z.enum(['intraday', 'short-term', 'long-term']),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '1d', '1w', '1mo']),
  qualificationRule: z.string().trim().min(8, 'Describe a qualification rule with at least 8 characters').max(400),
  qualificationCadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
  entryRule: z.string().trim().min(8, 'Describe an entry condition with at least 8 characters').max(300),
  exitRule: z.string().trim().min(8, 'Describe an exit condition with at least 8 characters').max(300),
  mode: z.enum(['PAPER', 'LIVE']),
}).refine((values) => horizonTimeframes[values.horizon].includes(values.timeframe), { path: ['timeframe'], message: 'Choose an evaluation timeframe that matches the trading horizon' });
export type TradingLayerValues = z.infer<typeof tradingLayerSchema>;
