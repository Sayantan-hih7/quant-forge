import { Schema, model } from 'mongoose';
import type { FinancialStatement } from '../providers/financial-statements.js';

interface FinancialSnapshot { _id: string; statements: FinancialStatement[]; sourceUrl?: string; fetchedAt?: string; attemptedAt?: string; error?: string }
const period = new Schema({ period: String, revenue: { type: Number, default: null }, sales: { type: Number, default: null }, netProfit: { type: Number, default: null }, ebitda: { type: Number, default: null }, eps: { type: Number, default: null } }, { _id: false });
const statement = new Schema({ basis: { type: String, enum: ['consolidated', 'standalone'] }, frequency: { type: String, enum: ['quarterly', 'annual'] }, periods: [period] }, { _id: false });
export const FinancialSnapshotModel = model<FinancialSnapshot>('StockFinancialSnapshot', new Schema<FinancialSnapshot>({
  _id: String, statements: { type: [statement], default: [] }, sourceUrl: String, fetchedAt: String, attemptedAt: String, error: String,
}, { versionKey: false, strict: 'throw' }), 'stock_financial_snapshots');
