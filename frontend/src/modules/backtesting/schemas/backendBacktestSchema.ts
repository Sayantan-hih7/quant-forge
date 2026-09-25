import { z } from 'zod';
const dayMs = 86400000;
export const backtestSetupSchema = (daily: boolean) => z.object({
  strategyId: z.string().uuid('Save and select a strategy'), from: z.string().date('Choose a start date'), to: z.string().date('Choose an end date'),
  universe: z.enum(['historical', 'current']), includeManual: z.boolean(), acknowledgeSelectionBias: z.boolean(), ids: z.array(z.string()).min(1, 'Choose at least one qualified stock').max(100, 'Select up to 100 stocks'),
}).superRefine((value, ctx) => {
  if (value.from > value.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'End date must follow the start date' });
  if (value.to >= new Date(Date.now() + 19_800_000).toISOString().slice(0, 10)) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Choose a completed day, before today' });
  if (Date.parse(value.to) - Date.parse(value.from) > (daily ? 1826 : 90) * dayMs) ctx.addIssue({ code: 'custom', path: ['from'], message: daily ? 'Choose a period of at most five years' : 'Intraday checks support at most 90 days per run' });
  if (value.universe === 'current' && !value.acknowledgeSelectionBias) ctx.addIssue({ code: 'custom', path: ['acknowledgeSelectionBias'], message: 'Acknowledge the research limitation to continue' });
});
