import type { FinancialPeriod } from '../types/financials';
export function financialGrowth(current: number | null, previous: number | null | undefined) {
  return current == null || previous == null || previous <= 0 ? null : (current - previous) / previous * 100;
}
export function previousYearPeriod(period: string) { return `${Number(period.slice(0, 4)) - 1}${period.slice(4, 7)}`; }
export function financialRows(periods: FinancialPeriod[]) {
  const byMonth = new Map(periods.map(p => [p.period.slice(0, 7), p]));
  return [...periods].sort((a, b) => a.period.localeCompare(b.period)).map(p => {
    const previous = byMonth.get(previousYearPeriod(p.period));
    return { ...p, revenueGrowth: financialGrowth(p.revenue, previous?.revenue), profitGrowth: financialGrowth(p.netProfit, previous?.netProfit) };
  });
}
export function financialPeriodLabel(period: string, annual = false) {
  const date = new Date(`${period}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return annual ? `Year ended ${date}` : date;
}
