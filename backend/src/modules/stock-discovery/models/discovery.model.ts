import { Schema, model } from 'mongoose';
import type { QuoteSnapshot, DiscoveryQuote } from '../types.js';
const quoteSchema = new Schema<DiscoveryQuote>({ instrumentId: String, price: Number, previousClose: { type: Number, default: null }, change: { type: Number, default: null }, percent: { type: Number, default: null },
  open: { type: Number, default: null }, high: { type: Number, default: null }, low: { type: Number, default: null }, volume: { type: Number, default: null }, averagePrice: { type: Number, default: null },
  lowerCircuit: { type: Number, default: null }, upperCircuit: { type: Number, default: null }, lastTradeAt: { type: String, default: null }, receivedAt: String, source: String,
  changeSource: { type: String, enum: ['nse-bhavcopy'] },
}, { _id: false });
export const DiscoverySnapshotModel = model<QuoteSnapshot>('DiscoverySnapshot', new Schema<QuoteSnapshot>({
  _id: String, quotes: { type: [quoteSchema], default: [] }, sessionDate: String, startedAt: String,
  completedAt: String, attemptedAt: String, warning: String,
}, { versionKey: false, strict: 'throw' }), 'stock_discovery_snapshots');
