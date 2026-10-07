import type { HistoryReview } from '../../market-data/services/history-repair.service.js';
import { Schema, model } from 'mongoose';
import type { ReportPreparation } from '../../market-data/services/daily-reports.service.js';
import type { Strategy } from '../../strategies/models/strategy.model.js';
export interface SelectionAudit { policy: 'ready'|'all'; requestedIds:string[]; includedIds:string[]; excluded:{instrumentId:string;reasons:string[]}[]; method:string }
export interface BacktestRun { requestFingerprint?:string; selectionAudit?: SelectionAudit; _id: string; strategy: Strategy; config: { from: string; to: string; universe: 'historical' | 'current'; includeManual: boolean; ids: string[]; dataPolicy?: 'ready' | 'all'; sessionDates?: string[]; preparationIssues?: Record<string,string[]> }; snapshots: unknown[]; status: 'queued' | 'running' | 'completed' | 'failed'; stage?: 'preparing' | 'calculating' | 'complete'; progress?: { processed: number; total: number; downloaded: number; reused: number; symbol: string }; symbols?: Record<string, string>; createdAt: string; finishedAt?: string; message?: string; result?: Record<string, unknown>; reportPreparation?: ReportPreparation; historyReview?: HistoryReview }
export const BacktestRunModel = model<BacktestRun>('BacktestRun', new Schema<BacktestRun>({
  _id: String, requestFingerprint:String, strategy: Schema.Types.Mixed, config: Schema.Types.Mixed, snapshots: [Schema.Types.Mixed], status: String,
  createdAt: String, finishedAt: String, message: String, result: Schema.Types.Mixed,
  selectionAudit: Schema.Types.Mixed, stage: String, progress: Schema.Types.Mixed, symbols: Schema.Types.Mixed, reportPreparation: Schema.Types.Mixed, historyReview: Schema.Types.Mixed,
}, { strict: 'throw', versionKey: false }), 'backtest_runs');
