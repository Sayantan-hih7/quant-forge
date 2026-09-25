import { AppError } from '../../../shared/errors.js';
import { DatasetReceiptModel } from '../models/dataset-receipt.model.js';
import { requestDhanPublic } from '../providers/dhan-public.client.js';
import { facts, instruments, writeFacts } from '../repository.js';
import { DHAN_PUBLIC_SEARCH_URL, dhanPublicFields, dhanPublicParserVersion, findDhanCompanyPage, parseDhanPublicCompany } from '../sources/dhan-public-company.js';
import type { Instrument } from '../types.js';

export async function ensureDhanPublicCompany(stock: Instrument, requested: string[], options: { maxWaitMs?: number } = {}, request = requestDhanPublic) {
  const fields = requested.filter(field => dhanPublicFields.has(field));
  if (!fields.length) return false;
  const now = new Date().toISOString();
  const available = await facts.distinct('field', { instrumentId: stock._id, field: { $in: fields }, knownAt: { $lte: now }, validUntil: { $gte: now } });
  const missing = fields.filter(field => !available.includes(field));
  if (!missing.length) return false;
  const id = `company-public:${stock.isin}`, receipt = await DatasetReceiptModel.findById(id).lean();
  if (receipt?.parserVersion === dhanPublicParserVersion && receipt?.retryAt && receipt.retryAt > now && missing.every(field => receipt.attemptedFields?.includes(field))) return false;
  if (receipt?.parserVersion === dhanPublicParserVersion && receipt?.checkedAt && Date.parse(receipt.checkedAt) > Date.now() - 7 * 86400000
    && missing.every(field => receipt.attemptedFields?.includes(field) && !receipt.fields?.includes(field))) return false;
  let sourceUrl = receipt?.sourceUrl;
  const deadline = Date.now() + (options.maxWaitMs ?? 45_000);
  const remaining = () => {
    if (Date.now() >= deadline) throw new AppError(502, 'DHAN_PUBLIC_TIMEOUT', 'Dhan public financial data request timed out');
    return deadline - Date.now();
  };
  try {
    if (!sourceUrl) {
      // Search uses the symbol/name, but acceptance always uses exact ISIN.
      for (const term of [...new Set([stock.symbol, stock.name])]) {
        const result = await request(DHAN_PUBLIC_SEARCH_URL, { data: { searchterm: term } }, remaining());
        sourceUrl = findDhanCompanyPage(result, stock.isin);
        if (sourceUrl) break;
      }
    }
    if (!sourceUrl) throw new AppError(502, 'DHAN_PUBLIC_NOT_FOUND', 'Dhan has no verified public financial page for this company');
    const html = await request(sourceUrl, undefined, remaining());
    if (typeof html !== 'string') throw new AppError(502, 'DHAN_PUBLIC_FORMAT', 'Dhan returned an unreadable company page');
    const at = new Date().toISOString(), rows = parseDhanPublicCompany(html, stock, sourceUrl, at);
    const listings = await instruments.find({ isin: stock.isin, active: true }).select('_id').lean();
    // Fill only missing fields. Existing official-API values keep their priority.
    const usable = rows.filter(row => missing.includes(row.field));
    await writeFacts(listings.flatMap(listing => usable.map(row => ({ ...row,
      _id: `dhan-public:${listing._id}:${row.field}:${at}`, instrumentId: listing._id }))));
    await DatasetReceiptModel.updateOne({ _id: id }, { $set: { instrumentId: stock._id, kind: 'company-public', sourceUrl,
      checkedAt: at, records: usable.length, fields: rows.map(row => row.field), attemptedFields: fields, parserVersion: dhanPublicParserVersion },
      $unset: { retryAt: 1, error: 1 } }, { upsert: true });
    return true;
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Public company financials are unavailable';
    await DatasetReceiptModel.updateOne({ _id: id }, { $set: { instrumentId: stock._id, kind: 'company-public',
      attemptedFields: fields, error: message, parserVersion: dhanPublicParserVersion,
      retryAt: new Date(Date.now() + (error instanceof AppError && error.code === 'DHAN_PUBLIC_NOT_FOUND' ? 86400000 : 300000)).toISOString() },
      $unset: { sourceUrl: 1 } }, { upsert: true });
    throw new AppError(502, 'DHAN_PUBLIC_UNAVAILABLE', message);
  }
}
