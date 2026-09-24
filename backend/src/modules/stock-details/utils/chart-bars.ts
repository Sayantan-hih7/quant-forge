import type { ChartBar, StockTimeframe } from '../types.js';

export const indianDate = (time: number | string) => new Date((typeof time === 'number' ? time : Date.parse(time)) + 19_800_000).toISOString().slice(0, 10);
export function aggregateBars(bars: ChartBar[], frame: StockTimeframe): ChartBar[] {
  const groups = new Map<string, ChartBar>();
  for (const bar of [...bars].sort((a, b) => a.time.localeCompare(b.time))) {
    const day = indianDate(bar.time);
    let key: string;
    if (frame === '1mo') key = `${day.slice(0, 7)}-01`;
    else if (frame === '1w') {
      const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); key = d.toISOString().slice(0, 10);
    } else if (frame === '1d') key = day;
    else {
      const minutes = Number(frame.slice(0, -1));
      const sessionStart = Date.parse(`${day}T09:15:00+05:30`);
      key = new Date(sessionStart + Math.floor((Date.parse(bar.time) - sessionStart) / (minutes * 60_000)) * minutes * 60_000).toISOString();
    }
    const previous = groups.get(key);
    if (previous) { previous.high = Math.max(previous.high, bar.high); previous.low = Math.min(previous.low, bar.low); previous.close = bar.close; previous.volume += bar.volume; }
    else groups.set(key, { ...bar, time: key });
  }
  return [...groups.values()];
}
