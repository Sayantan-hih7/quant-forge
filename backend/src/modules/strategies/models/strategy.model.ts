import { Schema, model } from 'mongoose';
import type { StrategyDraft } from '../validations/strategy.validation.js';
export interface Strategy extends StrategyDraft { _id: string; revision: number; savedAt: string }
const schema = new Schema<Strategy>({ _id: String, name: String, entry: Schema.Types.Mixed, exit: Schema.Types.Mixed,
  risk: Schema.Types.Mixed, revision: Number, savedAt: String }, { versionKey: false, strict: 'throw' });
export const StrategyModel = model<Strategy>('Strategy', schema, 'strategies');
export const StrategyRevisionModel = model<Strategy>('StrategyRevision', schema.clone(), 'strategy_revisions');
