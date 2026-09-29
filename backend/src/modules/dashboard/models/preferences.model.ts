import { model, Schema } from 'mongoose';
import type { DashboardPreferences } from '../validations/preferences.validation.js';
interface PreferencesDocument { _id: string; revision: number; settings: DashboardPreferences; updatedAt: string }
export const DashboardPreferencesModel = model<PreferencesDocument>('DashboardPreferences', new Schema<PreferencesDocument>({
  _id: String, revision: Number, settings: Schema.Types.Mixed, updatedAt: String,
}, { versionKey: false, strict: 'throw' }), 'dashboard_preferences');
