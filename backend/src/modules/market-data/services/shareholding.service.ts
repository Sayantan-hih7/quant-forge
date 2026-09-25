import { AppError, invariant } from '../../../shared/errors.js';
import { numberOrNull, object } from '../../../shared/http-client.js';
import { DatasetReceiptModel } from '../models/dataset-receipt.model.js';
import { requestShareholding } from '../providers/shareholding.client.js';
import { facts, instruments, writeFacts } from '../repository.js';
import { parseBseShareholding, parseNseShareholding, selectBsePledge, selectNseFiling, type OwnershipReport } from '../sources/shareholding.js';
import type { Instrument, Fact } from '../types.js';

type Request = typeof requestShareholding;
const indices = new Map<string, { until: number; promise: Promise<unknown> }>();
function nseIndex(segment: string, request: Request) {
  const current = indices.get(segment);
  if (current && current.until > Date.now()) return current.promise;
  const promise = request(`https://www.nseindia.com/api/corporate-share-holdings-master?index=${segment}`).catch(error => { indices.delete(segment); throw error; });
  indices.set(segment, { until: Date.now() + 3600_000, promise }); return promise;
}
export async function ensureShareholding(stock: Instrument, request: Request = requestShareholding) {
  const now = new Date().toISOString();
  if (await facts.exists({ instrumentId: stock._id, field: 'pledge', knownAt: { $lte: now }, validUntil: { $gte: now } })) return false;
  const id = `shareholding:${stock.isin}`, receipt = await DatasetReceiptModel.findById(id).lean();
  if (receipt?.retryAt && receipt.retryAt > now) return false;
  const listings = await instruments.find({ isin: stock.isin, active: true }).lean();
  const nse = listings.find(s => s.exchange === 'NSE'), bse = listings.find(s => s.exchange === 'BSE');
  let report: OwnershipReport | undefined, sourceUrl = '', failure = 'No recent verified shareholding report is available', transient = false;
  function failed(error: unknown, fallback: string) {
    failure = error instanceof AppError ? error.message : fallback;
    transient ||= error instanceof AppError && ['FILING_UNAVAILABLE', 'FILING_BUSY'].includes(error.code);
  }
  if (nse) {
    try {
      const segment = ['SM', 'ST'].includes(nse.series) ? 'sme' : 'equities';
      let filing = selectNseFiling(await nseIndex(segment, request), nse.symbol, now);
      // Provider series labels do not reliably identify SME listings or migrations.
      if (!filing) filing = selectNseFiling(await nseIndex(segment === 'sme' ? 'equities' : 'sme', request), nse.symbol, now);
      // The recent master omits some companies; query their actual filing history.
      if (!filing) filing = selectNseFiling(await request(`https://www.nseindia.com/api/corporate-share-holdings-master?index=${segment}&symbol=${encodeURIComponent(nse.symbol)}`), nse.symbol, now);
      if (!filing) filing = selectNseFiling(await request(`https://www.nseindia.com/api/corporate-share-holdings-master?index=${segment === 'sme' ? 'equities' : 'sme'}&symbol=${encodeURIComponent(nse.symbol)}`), nse.symbol, now);
      invariant(filing, 'No recent NSE shareholding filing is available');
      sourceUrl = filing.url;
      const xml = await request(sourceUrl); invariant(typeof xml === 'string', 'Shareholding filing is not XML');
      // Master metadata can retain an old ISIN after a split. The actual filing must match the current ISIN.
      report = parseNseShareholding(xml, stock.isin, filing.period, now, filing.noPromoters);
    } catch (error) { failed(error, 'NSE shareholding report is unavailable'); }
  }
  if (!report && bse) {
    try {
      const indexUrl = `https://api.bseindia.com/BseIndiaAPI/api/ConsolidatePledge/w?flag=&scripcode=${encodeURIComponent(bse.securityId)}`;
      const filing = selectBsePledge(await request(indexUrl), bse.securityId, now);
      invariant(filing, 'No recent BSE shareholding filing is available');
      const quarter = numberOrNull(filing.row.Fld_QuarterId); invariant(quarter !== null && quarter > 0, 'Invalid BSE filing reference');
      sourceUrl = `https://api.bseindia.com/BseIndiaAPI/api/Corp_shpPromoterNGroup_ng/w?SCRIPCODE=${bse.securityId}&QtrCode=${quarter}`;
      const payload = await request(sourceUrl), header = object((object(payload).Table as unknown[])?.[0]);
      invariant(String(header.Fld_AuthoriseDate ?? '').slice(0, 10) === String(filing.row.SHP_PulishedTime).slice(0, 10), 'BSE detail does not match the selected filing');
      const issued = numberOrNull(filing.row.TOTAL_NO_OF_ISSUED_SHARES), publicShares = numberOrNull(filing.row.Public_NoofShares_HOLDING);
      try { report = parseBseShareholding(payload, filing.period, now, issued !== null && issued > 0 && issued === publicShares); }
      catch {
        // The promoter detail can be empty for professionally managed companies.
        // Verify the explicit promoter total in the same filing's summary table.
        sourceUrl = `https://api.bseindia.com/BseIndiaAPI/api/Corp_shpSec_SHPSUMMARY_ng/w?scripcode=${bse.securityId}&qtrcode=${quarter}`;
        const summary = await request(sourceUrl), summaryHeader = object((object(summary).Table as unknown[])?.[0]);
        invariant(String(summaryHeader.Fld_AuthoriseDate ?? '').slice(0, 10) === String(filing.row.SHP_PulishedTime).slice(0, 10), 'BSE summary does not match the selected filing');
        report = parseBseShareholding(summary, filing.period, now);
      }
    } catch (error) { failed(error, 'BSE shareholding report is unavailable'); }
  }
  if (!report) {
    await DatasetReceiptModel.updateOne({ _id: id }, { $set: { instrumentId: stock._id, kind: 'shareholding', attemptedFields: ['pledge'],
      checkedAt: now, records: 0, error: failure, retryAt: new Date(Date.now() + (transient ? 60_000 : 30 * 60_000)).toISOString() } }, { upsert: true });
    throw new AppError(502, 'SHAREHOLDING_MISSING', failure);
  }
  const at = new Date().toISOString();
  const rows: Fact[] = listings.map(listing => ({ _id: `shareholding:${listing._id}:${report.period}:${at}`, instrumentId: listing._id,
    field: 'pledge', value: report.value, source: sourceUrl.includes('nseindia') ? 'nse-shareholding' : 'bse-shareholding', sourceUrl,
    period: report.period, observedAt: at, knownAt: at, validUntil: new Date(Date.parse(report.period) + 150 * 86400000).toISOString(), basis: 'published-report',
    ownership: { evidence: report.evidence, promoterShares: report.promoterShares, encumberedShares: report.encumberedShares } }));
  await writeFacts(rows);
  await DatasetReceiptModel.updateOne({ _id: id }, { $set: { instrumentId: stock._id, kind: 'shareholding', checkedAt: at, records: 1,
    sourceUrl, fields: ['pledge'], attemptedFields: ['pledge'] }, $unset: { error: 1, retryAt: 1 } }, { upsert: true });
  return true;
}
