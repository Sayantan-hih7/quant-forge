import { dhanRequest } from '../../connections/services/dhan.service.js';
import { facts, instruments, storedCandles, writeFacts } from '../repository.js';
import { parseDhanCompany } from '../sources/dhan-company.js';
import { parseDhanHistory } from '../sources/dhan-history.js';
import { DatasetReceiptModel } from '../models/dataset-receipt.model.js';
import type { Instrument } from '../types.js';

export async function ensureCompanyData(stock: Instrument, fields: string[], month: string, options: { maxWaitMs?: number } = {}) {
  if (!fields.length) return false;
  const now = new Date().toISOString();
  const available = await facts.distinct('field', { instrumentId: stock._id, field: { $in: fields }, knownAt: { $gte: `${month}-01`, $lte: now }, validUntil: { $gte: now } });
  if (fields.every(field => available.includes(field))) return false;
  const id = `company:${stock._id}:${month}`;
  const receipt = await DatasetReceiptModel.findById(id).lean();
  // An endpoint can legitimately omit a company metric. Do not repeatedly
  // request it within the same day; keep the missing field explicit.
  if (receipt?.checkedAt && Date.parse(receipt.checkedAt) > Date.now() - 86400000) return false;
  const data = await dhanRequest('/data/companyinfo', { securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY', metrics: ['CO', 'RATIOS', 'SHP'] }, options);
  const at = new Date().toISOString(), rows = parseDhanCompany(data, stock, at);
  const listings = await instruments.find({ isin: stock.isin, active: true }).select('_id').lean();
  await writeFacts(listings.flatMap(listing => rows.map(row => ({ ...row, _id: `dhan:${listing._id}:${row.field}:${at}`, instrumentId: listing._id }))));
  await DatasetReceiptModel.updateOne({ _id: id }, { $set: { instrumentId: stock._id, kind: 'company', checkedAt: at, records: rows.length, fields: rows.map(x => x.field) } }, { upsert: true });
  return true;
}

export async function ensureMonthlyHistory(stock: Instrument, from: string, to: string, options: { maxWaitMs?: number } = {}) {
  const covered = await DatasetReceiptModel.findOne({ instrumentId: stock._id, kind: 'daily', from: { $lte: from }, to: { $gte: to } }).lean();
  if (covered) return false;
  // Daily history has no 90-day restriction (that applies to intraday). Fetch
  // the full required warm-up range together so partial imports cannot masquerade as coverage.
  const data = await dhanRequest('/charts/historical', { securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY', oi: false, expiryCode: 0, fromDate: from, toDate: to }, options);
  const at = new Date().toISOString();
  const rows = parseDhanHistory(data, stock, '1d', at).filter(row => row.time.slice(0, 10) >= from && row.time.slice(0, 10) < to);
  for (let offset = 0; offset < rows.length; offset += 500) await storedCandles.bulkWrite(rows.slice(offset, offset + 500).map(row => ({ updateOne: {
    filter: { instrumentId: row.instrumentId, interval: '1d', time: row.time }, update: { $set: row }, upsert: true,
  } })));
  await DatasetReceiptModel.updateOne({ _id: `daily:${stock._id}:${from}:${to}` }, { $set: { instrumentId: stock._id, kind: 'daily', from, to, checkedAt: at, records: rows.length } }, { upsert: true });
  return true;
}
