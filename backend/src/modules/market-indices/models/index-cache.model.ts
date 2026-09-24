import { Schema, model } from 'mongoose';
import type { IndexExchange, IndexSnapshot, IndexPoint } from '../types.js';
export interface IndexCache {
  _id: IndexExchange; quotes: IndexSnapshot[]; attemptedAt?: string; dailyAttemptedAt?: string;
  succeededAt?: string; warning?: string;
}
const pointSchema = new Schema({ time: Number, value: Number }, { _id: false });
const snapshotSchema = new Schema<IndexSnapshot>({
  id: String, exchange: String, name: String, last: Number, previousClose: Number, change: Number, percent: Number,
  open: Number, high: Number, low: Number, high52w: Number, low52w: Number, asOf: String, fetchedAt: String,
  source: String, sourceUrl: String, kind: String, points: [pointSchema], chartKind: String,
  references: [new Schema({ label: String, value: Number, date: String }, { _id: false })],
  advances: Number, declines: Number, unchanged: Number, pe: Number, pb: Number, dividendYield: Number,
}, { _id: false });
export const IndexCacheModel = model<IndexCache>('IndexCache', new Schema<IndexCache>({
  _id: String, quotes: { type: [snapshotSchema], default: [] }, attemptedAt: String, dailyAttemptedAt: String,
  succeededAt: String, warning: String,
}, { versionKey: false, strict: 'throw' }), 'index_quote_cache');
export interface ChartCache { _id: string; points: IndexPoint[]; sourceUrl: string; fetchedAt: string }
export const IndexChartModel = model<ChartCache>('IndexChart', new Schema<ChartCache>({
  _id: String, points: [new Schema({ time: Number, value: Number }, { _id: false })], sourceUrl: String, fetchedAt: String,
}, { versionKey: false, strict: 'throw' }), 'index_chart_cache');
