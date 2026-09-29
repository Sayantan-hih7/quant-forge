import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
export const runnerScopeSchema = z.object({strategyId:z.string().uuid(),expectedRevision:z.number().int().positive().optional(),ids:z.array(instrumentIdSchema).min(1).max(200)}).strict();
export const sessionSchema = runnerScopeSchema.extend({mode:z.enum(['signals','automatic','confirmation']),sourceBacktestId:z.string().uuid().optional()}).strict();
export const orderSchema = z.object({id:z.string().uuid(),sessionId:z.string().uuid(),instrumentId:instrumentIdSchema,side:z.enum(['BUY','SELL']),quantity:z.number().int().min(1).max(1000000),orderType:z.enum(['market','limit']).optional(),limitPrice:z.number().positive().max(10000000).multipleOf(0.01).optional()}).strict().superRefine((v,c)=>{
  if(v.orderType==='limit'&&!v.limitPrice)c.addIssue({code:'custom',path:['limitPrice'],message:'Enter a limit price'});
  if(v.limitPrice!==undefined&&v.orderType!=='limit')c.addIssue({code:'custom',path:['limitPrice'],message:'A price is only used for limit orders'});
});
export const amendOrderSchema=z.object({orderType:z.enum(['market','limit']),limitPrice:z.number().positive().max(10000000).multipleOf(0.01).optional(),expectedEligibleAfter:z.string().datetime()}).strict().superRefine((v,c)=>{
  if(v.orderType==='limit'&&!v.limitPrice)c.addIssue({code:'custom',path:['limitPrice'],message:'Enter a limit price'});
  if(v.orderType==='market'&&v.limitPrice!==undefined)c.addIssue({code:'custom',path:['limitPrice'],message:'Market orders do not have a limit price'});
});
export const exitPositionSchema=z.object({id:z.string().uuid(),expectedOpenedAt:z.string().datetime(),quantity:z.number().int().positive().max(1000000).optional()}).strict();
export const controlSchema = z.object({entriesPaused:z.boolean()}).strict();

export const sessionConfigurationSchema = z.object({ids:z.array(instrumentIdSchema).min(1).max(200).optional(),mode:z.enum(['signals','confirmation','automatic']).optional()}).strict().refine(x=>x.ids!==undefined||x.mode!==undefined,'Choose a scope or execution mode');
