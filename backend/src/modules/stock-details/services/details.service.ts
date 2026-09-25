import { AppError } from '../../../shared/errors.js';
import { latestFacts } from '../../market-data/repository.js';
import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import { MonthlyUniverseModel, QualificationResultModel, QualificationRunModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import { ensureCompanyData } from '../../market-data/services/dhan-cache.service.js';

export async function stockDetail(id: string) {
  const [instrument, universe] = await Promise.all([
    InstrumentModel.findById(id).lean(), MonthlyUniverseModel.findById(currentMonth()).lean(),
  ]);
  if (!instrument) throw new AppError(404, 'STOCK_NOT_FOUND', 'Stock not found');
  let message: string | undefined;
  if (instrument.active) {
    try { await ensureCompanyData(instrument, ['marketCap', 'pe', 'sector', 'roe', 'roce'], currentMonth(), { maxWaitMs: 15_000 }); }
    catch { message = 'Company data could not be refreshed. Previously saved metrics are shown with their dates; unavailable values are left blank.'; }
  }
  const facts = await latestFacts(id, new Date().toISOString());
  const member = universe?.members.find(x => x.instrumentId === id);
  let qualification = null;
  if (member && universe) {
    const run = member.source === 'scan' ? await QualificationRunModel.findById(universe.runId).select('cutoff rule').lean() : null;
    const result = member.source === 'scan' ? await QualificationResultModel.findOne({ runId: universe.runId, instrumentId: id }).lean() : null;
    qualification = { source: member.source, month: universe.month, note: member.note, addedAt: member.addedAt,
      cutoff: run?.cutoff ?? null, rule: run?.rule ?? null, checks: result?.checks ?? [] };
  }
  return { instrument, facts, qualification, message };
}
