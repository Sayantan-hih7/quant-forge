import { AppError } from '../../../shared/errors.js';
import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import { DatasetReceiptModel } from '../../market-data/models/dataset-receipt.model.js';
import { requestDhanPublic } from '../../market-data/providers/dhan-public.client.js';
import { DHAN_PUBLIC_SEARCH_URL, findDhanCompanyPage } from '../../market-data/sources/dhan-public-company.js';
import type { Instrument } from '../../market-data/types.js';
import { FinancialSnapshotModel } from '../models/financial-snapshot.model.js';
import { parseFinancialStatements } from '../providers/financial-statements.js';

const pending = new Map<string, Promise<void>>();
async function refresh(stock: Instrument, previousUrl?: string) {
  const attemptedAt = new Date().toISOString();
  try {
    const receipt = previousUrl ? null : await DatasetReceiptModel.findById(`company-public:${stock.isin}`).select('sourceUrl').lean();
    let url = previousUrl ?? receipt?.sourceUrl;
    const deadline = Date.now() + 30000;
    if (!url) for (const term of [...new Set([stock.symbol, stock.name])]) {
      url = findDhanCompanyPage(await requestDhanPublic(DHAN_PUBLIC_SEARCH_URL, { data: { searchterm: term } }, Math.max(1, deadline - Date.now())), stock.isin);
      if (url) break;
    }
    if (!url) throw new AppError(502, 'FINANCIALS_NOT_FOUND', 'A financial statement page could not be matched to this company.');
    const html = await requestDhanPublic(url, undefined, Math.max(1, deadline - Date.now()));
    if (typeof html !== 'string') throw new AppError(502, 'FINANCIALS_FORMAT', 'Financial statements could not be read.');
    const fetchedAt = new Date().toISOString();
    const statements = parseFinancialStatements(html, stock.isin, url, fetchedAt);
    if (!statements.length) throw new AppError(502, 'FINANCIALS_EMPTY', 'Quarterly and annual statements are not available from this source for this company.');
    await FinancialSnapshotModel.updateOne({ _id: stock.isin }, { $set: { statements, sourceUrl: url, fetchedAt, attemptedAt }, $unset: { error: 1 } }, { upsert: true });
  } catch (e) {
    await FinancialSnapshotModel.updateOne({ _id: stock.isin }, { $set: { attemptedAt, error: e instanceof AppError ? e.message : 'Financial statements could not be refreshed.' } }, { upsert: true });
  }
}

export async function stockFinancials(id: string) {
  const stock = await InstrumentModel.findById(id).lean();
  if (!stock) throw new AppError(404, 'STOCK_NOT_FOUND', 'Stock not found');
  let cached = await FinancialSnapshotModel.findById(stock.isin).lean();
  if ((!cached?.fetchedAt || Date.now() - Date.parse(cached.fetchedAt) > 86400000) && (!cached?.attemptedAt || Date.now() - Date.parse(cached.attemptedAt) > 60000)) {
    let job = pending.get(stock.isin);
    if (!job) { job = refresh(stock, cached?.sourceUrl).finally(() => pending.delete(stock.isin)); pending.set(stock.isin, job); }
    await job;
    cached = await FinancialSnapshotModel.findById(stock.isin).lean();
  }
  return { instrumentId: id, isin: stock.isin, statements: cached?.statements ?? [], source: 'Dhan public company financials', sourceUrl: cached?.sourceUrl,
    fetchedAt: cached?.fetchedAt ?? null, status: cached?.error ? cached.statements.length ? 'stale' : 'unavailable' : 'ready', message: cached?.error,
    currency: 'INR', unit: 'crore' };
}
