import { benchmarkHistory, type BenchmarkName } from '../../stock-details/services/benchmark-history.service.js';
import { ruleBenchmarks } from '../../stock-details/services/benchmark-requirements.js';
import axios from 'axios';
import { env } from '../../../config/env.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { facts, storedCandles, deliveryDays } from '../../market-data/repository.js';
import { DatasetReceiptModel } from '../../market-data/models/dataset-receipt.model.js';
import { missingHistoryRanges } from '../../market-data/services/history-coverage.js';
import { monthlyHistoryRequirements } from '../../qualification/services/history-requirements.js';
export const engineClient = axios.create({ baseURL: env.ENGINE_URL, timeout: 120_000, maxContentLength: 32_000_000, maxBodyLength: 32_000_000 });
engineClient.interceptors.request.use(config => { config.headers.set('X-Engine-Token', env.ENGINE_TOKEN); return config; });
engineClient.interceptors.response.use(response => response, (error: unknown) => {
  const validation = axios.isAxiosError(error) && error.response?.status === 422;
  const detail = validation && error.response?.data?.detail;
  return Promise.reject(new AppError(validation ? 422 : 503, validation ? 'ENGINE_VALIDATION' : 'ENGINE_UNAVAILABLE',
    typeof detail === 'string' ? detail.slice(0, 1500) : 'The calculation engine is unavailable'));
});
export interface EvaluationResult { id: string; matched: boolean | null; status: 'qualified' | 'rejected' | 'unavailable' | 'awaiting_history'; checks: { matched: boolean | null; field: string; eventKey?: string; missingField?: string; reason?: string; code?: string; availableMonths?: number; requiredMonths?: number; left?: number; right?: number }[] }
export async function engineInstruments(ids: string[], cutoff: string, monthly = false, window?: { benchmarks?: BenchmarkName[]; dailyFrom?: string; intradayFrom?: string; reportsFrom?: string }, factsOnly = false, candleLimit = 150000) {
  const [prices, observations, reports] = await Promise.all([
    factsOnly ? Promise.resolve([]) : storedCandles.find({ instrumentId: { $in: ids }, time: { $lt: cutoff }, ...(monthly ? { interval: '1d' } : {}), ...(window ? { $or: [
      ...(window.dailyFrom ? [{ interval: '1d' as const, time: { $gte: `${window.dailyFrom}T00:00:00.000Z`, $lt: cutoff } }] : []),
      ...(window.intradayFrom ? [{ interval: '1m' as const, time: { $gte: `${window.intradayFrom}T00:00:00.000Z`, $lt: cutoff } }] : []),
    ] } : {}) }).select('instrumentId interval time open high low close volume -_id').sort({ time: 1 }).limit(candleLimit + 1).lean(),
    facts.find({ instrumentId: { $in: ids }, knownAt: { $lte: cutoff } }).sort({ knownAt: 1 }).lean(),
    !factsOnly && window?.reportsFrom ? deliveryDays.find({ instrumentId: { $in: ids }, date: { $gte: window.reportsFrom }, knownAt: { $lte: cutoff } }).select('instrumentId date turnoverCr knownAt -_id').lean() : Promise.resolve([]),
  ]);
  invariant(prices.length<=candleLimit,`This history batch exceeds ${candleLimit.toLocaleString('en-US')} candles. Reduce the indicator warm-up or historical date range.`);
  const byStock=new Map<string,typeof prices>();
  for(const price of prices){const rows=byStock.get(price.instrumentId)??[];rows.push(price);byStock.set(price.instrumentId,rows);}
  const factsByStock = new Map<string, typeof observations>();
  for (const observation of observations) {
    const rows = factsByStock.get(observation.instrumentId) ?? [];
    rows.push(observation); factsByStock.set(observation.instrumentId, rows);
  }
  const reportsByStock = new Map<string, typeof reports>();
  for (const report of reports) { const rows = reportsByStock.get(report.instrumentId) ?? []; rows.push(report); reportsByStock.set(report.instrumentId, rows); }
  const benchmarks:Record<string,unknown[]>={};
  if(!factsOnly)for(const name of window?.benchmarks??[]) { const from=window?.dailyFrom??new Date(Date.parse(cutoff)-2196*86400000).toISOString().slice(0,10);const history=await benchmarkHistory(name,'1d',from,cutoff);benchmarks[name]=history.bars; }
  return ids.map(id => ({ id, benchmarks, reports: reportsByStock.get(id) ?? [],
    daily: (byStock.get(id)??[]).filter(x=>x.interval==='1d'),
    intraday: (byStock.get(id)??[]).filter(x=>x.interval==='1m'),
    facts: (factsByStock.get(id) ?? []).map(x => ({ knownAt: x.knownAt, validUntil: x.validUntil, period: x.period,
      priority: x.source === 'dhan-public-company' ? 0 : 1, values: { [x.field]: x.value } })),
  }));
}
export async function evaluateBatch(rule: Record<string, unknown>, ids: string[], cutoff: string, options: { factsOnly?: boolean } = {}) {
  const needed=ruleBenchmarks([rule]);
  const scope=needed.length?{benchmarks:needed,dailyFrom:monthlyHistoryRequirements(rule,new Date(Date.parse(cutoff)+19800000).toISOString().slice(0,7)).from}:undefined;
  const instruments = await engineInstruments(ids, cutoff, rule.timeframe === '1mo', scope, options.factsOnly);
  const history = monthlyHistoryRequirements(rule, new Date(Date.parse(cutoff) + 19800000).toISOString().slice(0, 7));
  const receipts = rule.timeframe === '1mo' && history.minimum && !options.factsOnly
    ? await DatasetReceiptModel.find({ instrumentId: { $in: ids }, kind: 'daily', checkedAt: { $lte: cutoff }, from: { $lt: history.to }, to: { $gt: history.from } }).select('instrumentId from to').lean() : [];
  const coverage = new Map<string, { from: string; to: string }[]>();
  for (const receipt of receipts) if (receipt.instrumentId && receipt.from && receipt.to) {
    const ranges = coverage.get(receipt.instrumentId) ?? [];
    ranges.push({ from: receipt.from, to: receipt.to }); coverage.set(receipt.instrumentId, ranges);
  }
  const { data } = await engineClient.post<{ results: EvaluationResult[] }>('/evaluate', { rule, cutoff, instruments: instruments.map(stock => ({ ...stock,
    monthlyHistoryChecked: !!history.minimum && coverage.has(stock.id) && !missingHistoryRanges(history.from, history.to, coverage.get(stock.id)!).length,
  })) });
  return data.results;
}
