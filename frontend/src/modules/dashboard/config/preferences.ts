import { z } from 'zod';
import { indexCatalog } from '../../market-data/config/indices';

export const dashboardSectionOptions = [
  { id: 'summary', label: 'Summary cards', description: 'Qualification, monitoring, positions and paper P&L.' },
  { id: 'market', label: 'Market overview', description: 'Your chosen NSE and BSE indices.' },
  { id: 'monitoring', label: 'Strategy monitoring', description: 'Active strategies, modes and rule revisions.' },
  { id: 'qualification', label: 'Monthly qualification', description: 'Published stocks and the latest scan.' },
  { id: 'signals', label: 'Recent signals', description: 'Recent buy and sell events.' },
  { id: 'backtests', label: 'Recent backtests', description: 'Reports, date ranges and rule revisions.' },
  { id: 'watchlists', label: 'Your watchlists', description: 'Shortcuts to lists you follow.' },
] as const;
export const metricOptions = [{ value: 'qualified', label: 'Qualified stocks' }, { value: 'monitoring', label: 'Strategies monitoring' }, { value: 'positions', label: 'Open paper positions' }, { value: 'pnl', label: 'Total paper P&L' }] as const;
const unique = (values: string[]) => new Set(values).size === values.length;
const indexIds = new Set(indexCatalog.map(index => index.id));
export const dashboardPreferencesSchema = z.object({
  sections: z.array(z.object({ id: z.enum(['summary', 'market', 'monitoring', 'qualification', 'signals', 'backtests', 'watchlists']), visible: z.boolean() })).length(7)
    .refine(rows => unique(rows.map(row => row.id)), 'Each section must appear once').refine(rows => rows.some(row => row.visible), 'Keep at least one section visible'),
  indexIds: z.array(z.string().refine(id => indexIds.has(id), 'Choose a supported index')).min(1, 'Choose at least one index').max(8, 'Choose up to 8 indices').refine(unique),
  metricIds: z.array(z.enum(['qualified', 'monitoring', 'positions', 'pnl'])).min(1, 'Choose at least one summary card').max(4).refine(unique),
  density: z.enum(['comfortable', 'compact']), showSparklines: z.boolean(),
  signalCount: z.union([z.literal(6), z.literal(10), z.literal(20)]), signalSide: z.enum(['all', 'BUY', 'SELL']),
  backtestCount: z.union([z.literal(4), z.literal(8), z.literal(12)]), monitoringPageSize: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  watchlistMode: z.enum(['recent', 'selected']), watchlistIds: z.array(z.string().min(1).max(100)).max(8, 'Choose up to 8 watchlists').refine(unique),
}).superRefine((value, ctx) => {
  if (value.watchlistMode === 'selected' && !value.watchlistIds.length) ctx.addIssue({ code: 'custom', path: ['watchlistIds'], message: 'Choose at least one watchlist, or use Recently updated' });
});
export type DashboardPreferences = z.infer<typeof dashboardPreferencesSchema>;
export type DashboardSectionId = DashboardPreferences['sections'][number]['id'];
export const defaultDashboardPreferences: DashboardPreferences = {
  sections: dashboardSectionOptions.map(({ id }) => ({ id, visible: true })),
  indexIds: ['nse:nifty-50', 'nse:nifty-bank', 'bse:bse-sensex', 'bse:bse-bankex'],
  metricIds: ['qualified', 'monitoring', 'positions', 'pnl'], density: 'comfortable', showSparklines: true,
  signalCount: 6, signalSide: 'all', backtestCount: 4, monitoringPageSize: 5, watchlistMode: 'recent', watchlistIds: [],
};
export interface SavedDashboardPreferences { revision: number; settings: DashboardPreferences; updatedAt: string | null; warning?: string }
