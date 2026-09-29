import { model, Schema } from 'mongoose';
import type { FeedRequest } from '../services/feed.service.js';
export interface FeedAutomation { state: 'idle' | 'scheduled' | 'blocked' | 'paused'; message: string; paperIds: string[]; unavailableIds: string[] }
export interface FeedSettings { _id: string; enabled: boolean; request?: FeedRequest; manualRequest?: FeedRequest; manualEnabled?: boolean; paperManaged?: boolean; automationPaused?: boolean; automation?: FeedAutomation; revision?: number }
export const FeedSettingsModel = model<FeedSettings>('FeedSettings', new Schema<FeedSettings>({
  _id: String, enabled: Boolean, request: Schema.Types.Mixed,
  manualRequest: Schema.Types.Mixed, manualEnabled: Boolean, paperManaged: Boolean, automationPaused: Boolean, automation: Schema.Types.Mixed, revision: Number,
}, { strict: 'throw', versionKey: false }), 'feed_settings');
