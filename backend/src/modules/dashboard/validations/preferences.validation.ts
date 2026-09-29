import { z } from 'zod';
import { indexInstruments } from '../../market-indices/config/index-catalog.js';

export const dashboardSections = ['summary', 'market', 'monitoring', 'qualification', 'signals', 'backtests', 'watchlists'] as const;
const indices = new Set(indexInstruments.map(index => index.id));
const unique = (values: string[]) => new Set(values).size === values.length;
export const dashboardPreferencesSchema = z.object({
  sections: z.array(z.object({ id: z.enum(dashboardSections), visible: z.boolean() }).strict()).length(dashboardSections.length)
    .refine(rows => unique(rows.map(row => row.id)), 'Each dashboard section must appear exactly once')
    .refine(rows => rows.some(row => row.visible), 'Keep at least one dashboard section visible'),
  indexIds: z.array(z.string().refine(id => indices.has(id), 'Choose an index from the supported NSE/BSE catalogue')).min(1).max(8).refine(unique, 'Remove duplicate indices'),
  metricIds: z.array(z.enum(['qualified', 'monitoring', 'positions', 'pnl'])).min(1).max(4).refine(unique, 'Remove duplicate summary cards'),
  density: z.enum(['comfortable', 'compact']),
  showSparklines: z.boolean(),
  signalCount: z.union([z.literal(6), z.literal(10), z.literal(20)]),
  signalSide: z.enum(['all', 'BUY', 'SELL']),
  backtestCount: z.union([z.literal(4), z.literal(8), z.literal(12)]),
  monitoringPageSize: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  watchlistMode: z.enum(['recent', 'selected']),
  watchlistIds: z.array(z.string().min(1).max(100)).max(8).refine(unique, 'Remove duplicate watchlists'),
}).strict();
export type DashboardPreferences = z.infer<typeof dashboardPreferencesSchema>;
export const defaultDashboardPreferences: DashboardPreferences = {
  sections: dashboardSections.map(id => ({ id, visible: true })),
  indexIds: ['nse:nifty-50', 'nse:nifty-bank', 'bse:bse-sensex', 'bse:bse-bankex'],
  metricIds: ['qualified', 'monitoring', 'positions', 'pnl'], density: 'comfortable', showSparklines: true,
  signalCount: 6, signalSide: 'all', backtestCount: 4, monitoringPageSize: 5, watchlistMode: 'recent', watchlistIds: [],
};
export const saveDashboardPreferencesSchema = z.object({ revision: z.number().int().min(0), settings: dashboardPreferencesSchema }).strict();
