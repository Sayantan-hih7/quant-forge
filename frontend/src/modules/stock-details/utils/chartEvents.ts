import type { ChartBar, ChartEvent, StockTimeframe } from '../types';
import { bucketTime } from './chartTime';
export function visibleChartEvents(events: ChartEvent[], bars: ChartBar[], frame: StockTimeframe) {
  const times = new Set(bars.map(b => b.time));
  return events.flatMap(event => {
    // Signals describe the candle just closed; fills belong to the execution candle.
    const at = Date.parse(event.at) - (event.kind === 'signal' ? 1 : 0);
    if (!Number.isFinite(at)) return [];
    const time = bucketTime(at, frame);
    return times.has(time) ? [{ ...event, time }] : [];
  }).sort((a,b) => a.time.localeCompare(b.time) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
