import { Schema, model } from 'mongoose';
export const DatasetReceiptModel = model('DatasetReceipt', new Schema({
  _id: String, instrumentId: String, kind: String, from: String, to: String,
  checkedAt: String, records: Number, fields: [String],
}, { versionKey: false, strict: 'throw' }), 'dataset_receipts');
