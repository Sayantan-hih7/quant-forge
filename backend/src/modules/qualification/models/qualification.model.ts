import { Schema, model } from 'mongoose';
export interface MonthlyRule { _id: string; rule: Record<string, unknown>; revision: number; fingerprint: string; savedAt: string }
export interface QualificationRun {
  _id: string; month: string; rule: Record<string, unknown>; revision: number; fingerprint: string; cutoff: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  ids: string[]; total: number; processed: number; qualified: number; rejected: number; unavailable: number; message?: string; finishedAt?: string;
  stage?: 'checking' | 'fundamentals' | 'history' | 'evaluating';
  preparation?: { processed: number; total: number; downloaded: number; cached: number; failed: number; ruledOut: number; failures: { instrumentId: string; message: string }[] };
}
export interface UniverseMember { instrumentId: string; isin: string; source: 'scan' | 'manual'; addedAt: string; note?: string }
export interface MonthlyUniverse { _id: string; month: string; runId: string; fingerprint: string; publishedAt: string; revision: number; members: UniverseMember[] }
const options = { versionKey: false as const, strict: 'throw' as const };
export const MonthlyRuleModel = model<MonthlyRule>('MonthlyRule', new Schema<MonthlyRule>({
  _id: String, rule: Schema.Types.Mixed, revision: Number, fingerprint: String, savedAt: String,
}, options), 'monthly_rules');
const runSchema = new Schema<QualificationRun>({
  _id: String, month: String, rule: Schema.Types.Mixed, revision: Number, fingerprint: String, cutoff: String,
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
  ids: [String], total: Number, processed: Number, qualified: Number, rejected: Number, unavailable: Number, message: String, finishedAt: String,
  stage: { type: String, enum: ['checking', 'fundamentals', 'history', 'evaluating'] },
  preparation: { type: new Schema({ processed: Number, total: Number, downloaded: Number, cached: Number, failed: Number, ruledOut: Number,
    failures: [{ _id: false, instrumentId: String, message: String }] }, { _id: false }), default: undefined },
}, options);
runSchema.index({ month: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['queued', 'running'] } } });
export const QualificationRunModel = model<QualificationRun>('QualificationRun', runSchema, 'qualification_runs');
const universeSchema = new Schema<MonthlyUniverse>({
  _id: String, month: String, runId: String, fingerprint: String, publishedAt: String, revision: Number,
  members: [{ _id: false, instrumentId: String, isin: String, source: { type: String, enum: ['scan', 'manual'] }, addedAt: String, note: String }],
}, options);
export const MonthlyUniverseModel = model<MonthlyUniverse>('MonthlyUniverse', universeSchema, 'qualified_stocks_cache');
// Append-only copies record the list that actually existed at each publication/manual edit.
export const UniverseSnapshotModel = model<MonthlyUniverse>('UniverseSnapshot', universeSchema.clone(), 'qualified_universe_snapshots');
const resultSchema = new Schema({ _id: String, runId: String, instrumentId: String, matched: Schema.Types.Mixed,
  status: String, checks: [Schema.Types.Mixed] }, options);
resultSchema.index({ runId: 1, status: 1 });
export const QualificationResultModel = model('QualificationResult', resultSchema, 'qualification_results');
