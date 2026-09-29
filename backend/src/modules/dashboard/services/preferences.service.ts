import { AppError } from '../../../shared/errors.js';
import { DashboardPreferencesModel } from '../models/preferences.model.js';
import { dashboardPreferencesSchema, defaultDashboardPreferences, saveDashboardPreferencesSchema, type DashboardPreferences } from '../validations/preferences.validation.js';

interface SavedDashboardPreferences { revision: number; settings: DashboardPreferences; updatedAt: string | null; warning?: string }
export async function dashboardPreferences(): Promise<SavedDashboardPreferences> {
  const stored = await DashboardPreferencesModel.findById('workspace').lean();
  if (!stored) return { revision: 0, settings: structuredClone(defaultDashboardPreferences), updatedAt: null };
  const parsed = dashboardPreferencesSchema.safeParse(stored.settings);
  return { revision: stored.revision, settings: parsed.success ? { ...parsed.data, watchlistMode: 'recent', watchlistIds: [] } : structuredClone(defaultDashboardPreferences), updatedAt: stored.updatedAt,
    ...(!parsed.success ? { warning: 'Some saved dashboard settings are no longer supported. Default settings are shown; review and save them to update your preferences.' } : {}) };
}
export async function saveDashboardPreferences(raw: unknown) {
  const { revision, settings } = saveDashboardPreferencesSchema.parse(raw);
  // Accept older clients' list preferences, but the workspace now has one list.
  settings.watchlistMode = 'recent'; settings.watchlistIds = [];
  const conflict = () => new AppError(409, 'DASHBOARD_CHANGED', 'Dashboard settings changed in another window. Reload the saved settings before saving your changes.');
  try {
    const stored = await DashboardPreferencesModel.findOneAndUpdate({ _id: 'workspace', revision },
      { $set: { settings, updatedAt: new Date().toISOString() }, $inc: { revision: 1 } },
      { returnDocument: 'after', upsert: revision === 0 }).lean();
    if (!stored) throw conflict();
    return { revision: stored.revision, settings: stored.settings, updatedAt: stored.updatedAt };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw conflict();
    throw error;
  }
}
