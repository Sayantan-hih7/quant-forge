import { invariant } from '../../../shared/errors.js';
import { numberOrNull, object } from '../../../shared/http-client.js';
import { dhanFinancialData } from '../../market-data/sources/dhan-public-company.js';

export interface FinancialPeriod {
  period: string;
  revenue: number | null;
  sales: number | null;
  netProfit: number | null;
  ebitda: number | null;
  eps: number | null;
}
export interface FinancialStatement {
  basis: 'consolidated' | 'standalone';
  frequency: 'quarterly' | 'annual';
  periods: FinancialPeriod[];
}
const fields = { revenue: 'REVENUE', sales: 'SALES', netProfit: 'NET_PROFIT', ebitda: 'EBITDA', eps: 'EPS' } as const;

export function parseFinancialStatements(html: string, isin: string, url: string, observedAt: string): FinancialStatement[] {
  const financials = dhanFinancialData(html, { isin }, url), statements: FinancialStatement[] = [];
  for (const [suffix, basis] of [['c', 'consolidated'], ['s', 'standalone']] as const) {
    for (const [periodCode, frequency] of [['q', 'quarterly'], ['y', 'annual']] as const) {
      const raw = object(financials[`incomeStat_${suffix}${periodCode}`]);
      if (raw.YEAR == null || raw.YEAR === '') continue;
      invariant(typeof raw.YEAR === 'string', 'Financial reporting periods are unreadable');
      const years = raw.YEAR.split('|').map(y => y.trim());
      invariant(new Set(years).size === years.length && years.every(y => /^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(y)), 'Financial reporting periods are invalid or duplicated');
      const columns = Object.fromEntries(Object.entries(fields).map(([name, field]) => {
        if (raw[field] == null || raw[field] === '') return [name, years.map(() => null)];
        invariant(typeof raw[field] === 'string', `Financial ${name} values are unreadable`);
        const values = raw[field].split('|');
        invariant(values.length === years.length, `Financial ${name} values do not match their periods`);
        return [name, values.map(numberOrNull)];
      })) as Record<keyof typeof fields, (number | null)[]>;
      const periods = years.flatMap((year, index) => {
        const period = new Date(Date.UTC(Number(year.slice(0, 4)), Number(year.slice(4)), 0)).toISOString().slice(0, 10);
        // These are observed statements, never point-in-time backtest inputs.
        if (period >= observedAt.slice(0, 10)) return [];
        const row: FinancialPeriod = { period, revenue: columns.revenue[index], sales: columns.sales[index], netProfit: columns.netProfit[index], ebitda: columns.ebitda[index], eps: columns.eps[index] };
        return Object.keys(fields).some(k => row[k as keyof typeof fields] !== null) ? [row] : [];
      }).sort((a, b) => a.period.localeCompare(b.period));
      if (periods.length) statements.push({ basis, frequency, periods });
    }
  }
  return statements;
}
