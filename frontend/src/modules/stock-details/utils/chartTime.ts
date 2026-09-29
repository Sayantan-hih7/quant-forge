import type { StockTimeframe } from '../types';
export const frameOptions: { label: string; value: StockTimeframe }[] = [
  { label: '1m', value: '1m' }, { label: '5m', value: '5m' }, { label: '15m', value: '15m' },
  { label: '1h', value: '1h' }, { label: '4h', value: '4h' }, { label: '1D', value: '1d' }, { label: '1W', value: '1w' }, { label: '1M', value: '1mo' },
];
export const isIntraday = (frame: StockTimeframe) => !['1d', '1w', '1mo'].includes(frame);
export const istDay = (at: number) => new Date(at + 19_800_000).toISOString().slice(0, 10);
export const frameMinutes = (frame: StockTimeframe) => parseInt(frame) * (frame.endsWith('h') ? 60 : 1);
export function bucketTime(at: number, frame: StockTimeframe) {
  const day = istDay(at);
  if (frame === '1d') return day;
  if (frame === '1mo') return `${day.slice(0, 7)}-01`;
  if (frame === '1w') {
    const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10);
  }
  const start = Date.parse(`${day}T03:45:00Z`), size = frameMinutes(frame) * 60_000;
  return new Date(start + Math.floor((at - start) / size) * size).toISOString();
}
export function barEnd(time: string, frame: StockTimeframe) {
  if (isIntraday(frame)) return Math.min(Date.parse(time) + frameMinutes(frame) * 60_000, Date.parse(`${istDay(Date.parse(time))}T10:00:00Z`));
  if (frame === '1d') return Date.parse(`${time.slice(0, 10)}T10:00:00Z`);
  const date = new Date(`${time.slice(0, 10)}T00:00:00+05:30`);
  if (frame === '1w') return date.getTime() + 7 * 86400000;
  const [year, month] = time.split('-').map(Number);
  return Date.UTC(year, month, 1) - 19_800_000;
}
