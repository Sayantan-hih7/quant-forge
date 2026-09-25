import { facts, instruments, storedCandles } from '../../market-data/repository.js';
import { universeRefreshStatus } from '../../market-data/services/universe-refresh.service.js';
import { monthlyFactFields, monthlyHistoryRequirements } from './history-requirements.js';

const factFields = monthlyFactFields;
export function monthlyRequiredFields(rule?: Record<string, unknown>) {
  const fields = new Set<string>();
  for (const group of (rule?.groups ?? []) as { conditions: Record<string, unknown>[] }[]) {
    for (const condition of group.conditions) {
      fields.add(String(condition.field));
      if (condition.operand === 'field') fields.add(String(condition.compareField));
    }
  }
  return [...fields].map(field => ({ field, kind: factFields.has(field) ? 'fact' as const : 'history' as const }));
}

async function collectCoverage(rule?: Record<string, unknown>) {
  const required = monthlyRequiredFields(rule);
  const stocks = await instruments.find({ active: true, primary: true }).select('_id').lean();
  const ids = stocks.map(stock => stock._id);
  const now = new Date().toISOString();
  const monthStart = new Date(`${new Date(Date.now() + 19800000).toISOString().slice(0, 7)}-01T00:00:00+05:30`).toISOString();
  const month = new Date(Date.now() + 19800000).toISOString().slice(0, 7);
  const needed = monthlyHistoryRequirements(rule ?? {}, month);
  const previousMonth = new Date(Date.parse(`${month}-01`) - 86400000).toISOString().slice(0, 7);
  const [observations, history] = await Promise.all([
    facts.aggregate<{ _id: string; count: number }>([
      { $match: { instrumentId: { $in: ids }, field: { $in: required.filter(x => x.kind === 'fact').map(x => x.field) },
        knownAt: { $lte: now }, $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: now } }] } },
      { $group: { _id: { field: '$field', instrument: '$instrumentId' } } },
      { $group: { _id: '$_id.field', count: { $sum: 1 } } },
    ]),
    required.some(x => x.kind === 'history') ? storedCandles.aggregate<{ _id: string; months: string[] }>([
      { $match: { instrumentId: { $in: ids }, interval: '1d', time: { $gte: needed.from, $lt: monthStart } } },
      { $group: { _id: '$instrumentId', months: { $addToSet: { $dateToString: { date: { $toDate: '$time' }, format: '%Y-%m', timezone: 'Asia/Kolkata' } } } } },
    ]) : Promise.resolve([]),
  ]);
  const consecutive = history.map(item => {
    const months = new Set(item.months); let cursor = previousMonth, count = 0;
    while (months.has(cursor)) { count++; cursor = new Date(Date.parse(`${cursor}-01`) - 86400000).toISOString().slice(0, 7); }
    return count;
  });
  return { companies: ids.length, checkedAt: now, fields: required.map(item => ({ ...item,
    ...(item.kind === 'history' ? { requiredMonths: needed.fields[item.field] } : {}),
    withData: item.kind === 'history' ? consecutive.filter(count => count >= needed.fields[item.field]).length : observations.find(row => row._id === item.field)?.count ?? 0,
  })) };
}
type Readiness = Awaited<ReturnType<typeof collectCoverage>> & { universeRefresh: Awaited<ReturnType<typeof universeRefreshStatus>> };
export function createReadinessCache(load: (rule?: Record<string, unknown>) => Promise<Readiness>) {
  let cached: { key: string; until: number; value: Readiness } | undefined;
  const pending = new Set<string>(), retryAfter = new Map<string, number>();
  return (rule?: Record<string, unknown>) => {
    const key = JSON.stringify([rule, new Date(Date.now() + 19800000).toISOString().slice(0, 7)]);
    if ((!cached || cached.key !== key || cached.until < Date.now()) && !pending.has(key) && (retryAfter.get(key) ?? 0) <= Date.now()) {
      pending.add(key);
      // Coverage is an informational aggregate over all stored candles. It must
      // not delay opening the page, polling progress, or submitting a scan.
      void load(rule).then(value => { cached = { key, value, until: Date.now() + 30_000 }; retryAfter.delete(key); })
        .catch(() => { retryAfter.set(key, Date.now() + 30_000); }).finally(() => pending.delete(key));
    }
    return cached?.key === key ? cached.value : undefined;
  };
}
export const qualificationReadiness = createReadinessCache(async rule => ({ ...await collectCoverage(rule), universeRefresh: await universeRefreshStatus() }));
