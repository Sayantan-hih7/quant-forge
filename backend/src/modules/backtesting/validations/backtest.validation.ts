import { z } from 'zod';
import {instrumentIdSchema} from '../../market-data/validations/market-data.validation.js';
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x => Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x);
export const backtestSchema = z.object({ strategyId: z.string().uuid(), expectedRevision: z.number().int().positive().optional(), from: day, to: day,
  universe: z.enum(['historical', 'current']), includeManual: z.boolean(), acknowledgeSelectionBias: z.boolean().default(false),
  ids:z.array(instrumentIdSchema).min(1).max(100).optional(),
}).strict().superRefine((x, c) => {
  if (x.to < x.from || Date.parse(x.to)-Date.parse(x.from) > 1826*86400000 || x.to >= new Date(Date.now()+19800000).toISOString().slice(0,10)) c.addIssue({code:'custom',message:'Use completed dates spanning at most five years'});
  if (x.universe === 'current' && !x.acknowledgeSelectionBias) c.addIssue({code:'custom',message:'Acknowledge that testing today’s list in the past introduces selection bias'});
});
