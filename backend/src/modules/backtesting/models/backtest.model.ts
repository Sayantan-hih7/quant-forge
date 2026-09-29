import { Schema, model } from 'mongoose';
import type { ReportPreparation } from '../../market-data/services/daily-reports.service.js';
import type { Strategy } from '../../strategies/models/strategy.model.js';
export interface BacktestRun { _id: string; strategy: Strategy; config: { from: string; to: string; universe: 'historical' | 'current'; includeManual: boolean; ids: string[] }; snapshots: unknown[]; status: 'queued' | 'running' | 'completed' | 'failed'; stage?: 'preparing' | 'calculating' | 'complete'; progress?: { processed: number; total: number; downloaded: number; reused: number; symbol: string }; symbols?: Record<string, string>; createdAt: string; finishedAt?: string; message?: string; result?: Record<string, unknown>; reportPreparation?: ReportPreparation }
export const BacktestRunModel = model<BacktestRun>('BacktestRun', new Schema<BacktestRun>({
  _id: String, strategy: Schema.Types.Mixed, config: Schema.Types.Mixed, snapshots: [Schema.Types.Mixed], status: String,
  createdAt: String, finishedAt: String, message: String, result: Schema.Types.Mixed,
  stage: String, progress: Schema.Types.Mixed, symbols: Schema.Types.Mixed, reportPreparation: Schema.Types.Mixed,
}, { strict: 'throw', versionKey: false }), 'backtest_runs');
