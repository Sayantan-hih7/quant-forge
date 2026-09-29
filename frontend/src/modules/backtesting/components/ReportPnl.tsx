import { reportMoney } from '../utils/reportFormat';

export function ReportPnl({ value }: { value: number }) {
  return <span className={`bt-money ${value > 0 ? 'positive' : value < 0 ? 'negative' : ''}`}>{value > 0 ? '+' : ''}{reportMoney(value)}</span>;
}
