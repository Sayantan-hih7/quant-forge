import { model, Schema } from 'mongoose';
import type { EventType } from './lexicon.js';

export interface NewsCompany { isin: string; symbol: string; name: string; confidence: number; method: 'filing' | 'name' | 'alias' | 'symbol' | 'ai'; sentiment?: number }
export interface NewsSentiment { score: number; label: 'positive' | 'neutral' | 'negative'; confidence: number; method: 'ai' | 'lexicon'; eventType: EventType; reason: string; model?: string; scoredAt: string }
export interface NewsItem {
  _id: string; titleKey: string; kind: 'news' | 'filing'; title: string; summary: string; url: string; publisher: string; sourceIds: string[];
  category?: string; publishedAt: string;
  /** When we first saw it. Rules and backtests may only use a story from this moment on. */
  knownAt: string;
  companies: NewsCompany[]; isins: string[]; sentiment: NewsSentiment;
  aiStatus: 'pending' | 'done' | 'failed' | 'skipped'; aiAttempts: number;
}
const options = { versionKey: false as const, strict: 'throw' as const };
const schema = new Schema<NewsItem>({
  _id: String, titleKey: { type: String, required: true }, kind: { type: String, enum: ['news', 'filing'], required: true },
  title: { type: String, required: true }, summary: String, url: { type: String, required: true }, publisher: String, sourceIds: [String],
  category: String, publishedAt: { type: String, required: true }, knownAt: { type: String, required: true },
  companies: [{ _id: false, isin: String, symbol: String, name: String, confidence: Number, method: String, sentiment: Number }],
  isins: [String],
  sentiment: { type: new Schema({ score: Number, label: String, confidence: Number, method: String, eventType: String, reason: String, model: String, scoredAt: String }, { _id: false }) },
  aiStatus: { type: String, enum: ['pending', 'done', 'failed', 'skipped'], default: 'pending' }, aiAttempts: { type: Number, default: 0 },
}, options);
schema.index({ publishedAt: -1 });
schema.index({ isins: 1, publishedAt: -1 });
schema.index({ titleKey: 1 });
schema.index({ aiStatus: 1, publishedAt: -1 });
export const NewsItemModel = model<NewsItem>('NewsItem', schema, 'news_items');
