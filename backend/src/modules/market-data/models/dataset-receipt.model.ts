import { Schema, model } from 'mongoose';
const schema = new Schema({
  _id: String, instrumentId: String, kind: String, from: String, to: String,
  checkedAt: String, records: Number, fields: [String],
  attemptedFields: [String], sourceUrl: String, retryAt: String, error: String,
  parserVersion: Number,
}, { versionKey: false, strict: 'throw' });
schema.index({ instrumentId: 1, kind: 1, from: 1, to: 1 });
export const DatasetReceiptModel = model('DatasetReceipt', schema, 'dataset_receipts');
