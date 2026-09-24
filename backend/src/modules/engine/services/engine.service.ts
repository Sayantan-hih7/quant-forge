import axios from 'axios';
import { env } from '../../../config/env.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { facts, storedCandles } from '../../market-data/repository.js';
export const engineClient = axios.create({ baseURL: env.ENGINE_URL, timeout: 120_000, maxContentLength: 32_000_000, maxBodyLength: 32_000_000 });
engineClient.interceptors.request.use(config => { config.headers.set('X-Engine-Token', env.ENGINE_TOKEN); return config; });
engineClient.interceptors.response.use(response => response, (error: unknown) => {
  const validation = axios.isAxiosError(error) && error.response?.status === 422;
  const detail = validation && error.response?.data?.detail;
  return Promise.reject(new AppError(validation ? 422 : 503, validation ? 'ENGINE_VALIDATION' : 'ENGINE_UNAVAILABLE',
    typeof detail === 'string' ? detail.slice(0, 1500) : 'The calculation engine is unavailable'));
});
export interface EvaluationResult { id: string; matched: boolean | null; status: 'qualified' | 'rejected' | 'unavailable'; checks: { matched: boolean | null; field: string; reason?: string; left?: number; right?: number }[] }
export async function engineInstruments(ids: string[], cutoff: string, monthly = false, window?: { dailyFrom?: string; intradayFrom?: string }) {
  const [prices, observations] = await Promise.all([
    storedCandles.find({ instrumentId: { $in: ids }, time: { $lt: cutoff }, ...(monthly ? { interval: '1d' } : {}), ...(window ? { $or: [
      ...(window.dailyFrom ? [{ interval: '1d' as const, time: { $gte: `${window.dailyFrom}T00:00:00.000Z`, $lt: cutoff } }] : []),
      ...(window.intradayFrom ? [{ interval: '1m' as const, time: { $gte: `${window.intradayFrom}T00:00:00.000Z`, $lt: cutoff } }] : []),
    ] } : {}) }).select('instrumentId interval time open high low close volume -_id').sort({ time: 1 }).limit(150001).lean(),
    facts.find({ instrumentId: { $in: ids }, knownAt: { $lte: cutoff } }).sort({ knownAt: 1 }).lean(),
  ]);
  invariant(prices.length<=150000,'This calculation exceeds 150,000 stored candles. Reduce the stock scope or use a smaller historical dataset.');
  const byStock=new Map<string,typeof prices>();
  for(const price of prices){const rows=byStock.get(price.instrumentId)??[];rows.push(price);byStock.set(price.instrumentId,rows);}
  return ids.map(id => ({ id,
    daily: (byStock.get(id)??[]).filter(x=>x.interval==='1d'),
    intraday: (byStock.get(id)??[]).filter(x=>x.interval==='1m'),
    facts: observations.filter(x => x.instrumentId === id).map(x => ({ knownAt: x.knownAt, validUntil: x.validUntil, period: x.period, values: { [x.field]: x.value } })),
  }));
}
export async function evaluateBatch(rule: Record<string, unknown>, ids: string[], cutoff: string) {
  const instruments = await engineInstruments(ids, cutoff, rule.timeframe === '1mo');
  const { data } = await engineClient.post<{ results: EvaluationResult[] }>('/evaluate', { rule, cutoff, instruments });
  return data.results;
}
