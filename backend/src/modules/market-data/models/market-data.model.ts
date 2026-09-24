import { Schema, model } from 'mongoose';
import type { Instrument, Fact, DeliveryDay, SourceRun, Candle } from '../types.js';

const options = { versionKey: false as const, strict: 'throw' as const };
const instrumentSchema = new Schema<Instrument>({
  _id: String, exchange: { type: String, enum: ['NSE', 'BSE'], required: true }, securityId: { type: String, required: true },
  isin: { type: String, required: true }, symbol: { type: String, required: true }, name: String, series: String,
  lotSize: Number, active: Boolean, primary: Boolean, observedAt: String, motilalCode: Number,
}, options);
instrumentSchema.index({ isin: 1, exchange: 1 });
instrumentSchema.index({ exchange: 1, symbol: 1 });
const factSchema = new Schema<Fact>({
  _id: String, instrumentId: { type: String, required: true }, field: { type: String, required: true },
  value: { type: Schema.Types.Mixed, required: true }, source: String, sourceUrl: String,
  observedAt: String, knownAt: { type: String, required: true }, period: String, validUntil: String,
  basis: { type: String, enum: ['observed-snapshot', 'published-report', 'derived'] },
}, options);
factSchema.index({ instrumentId: 1, field: 1, knownAt: -1 });
const deliverySchema = new Schema<DeliveryDay>({
  _id: String, instrumentId: { type: String, required: true }, date: String, volume: Number,
  deliverable: { type: Number, default: null }, turnoverCr: Number, source: String, sourceUrl: String, observedAt: String, knownAt: String,
}, options);
deliverySchema.index({ instrumentId: 1, date: 1 }, { unique: true });
const candleSchema = new Schema<Candle>({
  instrumentId: { type: String, required: true }, interval: { type: String, enum: ['1d', '1m'], required: true },
  time: { type: String, required: true }, open: Number, high: Number, low: Number, close: Number, volume: Number,
  source: String, observedAt: String,
}, options);
candleSchema.index({ instrumentId: 1, interval: 1, time: 1 }, { unique: true });
const runSchema = new Schema<SourceRun>({
  _id: String, source: String, status: { type: String, enum: ['running', 'completed', 'partial', 'failed'] },
  startedAt: String, finishedAt: String, processed: Number, total: Number,
  failures: [{ _id: false, item: String, message: String }], details: Schema.Types.Mixed,
}, options);
runSchema.index({ source: 1, startedAt: -1 });
export const InstrumentModel = model<Instrument>('Instrument', instrumentSchema, 'instruments');
export const FactModel = model<Fact>('Fact', factSchema, 'facts');
export const DeliveryDayModel = model<DeliveryDay>('DeliveryDay', deliverySchema, 'daily_delivery');
export const CandleModel = model<Candle>('Candle', candleSchema, 'candles');
export const SourceRunModel = model<SourceRun>('SourceRun', runSchema, 'source_runs');
export const SourceArtifactModel = model('SourceArtifact', new Schema({
  _id: String, source: String, date: String, checksum: String, rowCount: Number, observedAt: String,
}, options), 'source_artifacts');
