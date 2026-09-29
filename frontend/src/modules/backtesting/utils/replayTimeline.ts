import type { ChartBar, ChartEvent, ChartLevel } from '../../stock-details/types';
import { barEnd } from '../../stock-details/utils/chartTime';
import type { BacktestReplayView, ReplayEvent } from '../types/replay';

export interface ReplayStep { bar: number; phase: 'open' | 'close'; at: number; event?: ReplayEvent }
const start = (bar: ChartBar) => Date.parse(bar.time.length === 10 ? `${bar.time}T03:45:00Z` : bar.time);

/** Each candle exposes its open first, then OHLC, then the recorded close events.
 * Event sequence disambiguates partial exits on the same candle. Never infer ticks. */
export function replayTimeline(view: BacktestReplayView, entryAt: string) {
  const bars = view.frames[view.timeframe] ?? [];
  const events = view.events.filter(e => Date.parse(e.entryAt) === Date.parse(entryAt));
  const starts = bars.map(start), ends = bars.map(b => barEnd(b.time, view.timeframe));
  const lowerBound = (values: number[], at: number) => {
    let lo = 0, hi = values.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid] < at) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const slots = new Map<number, ReplayEvent[]>();
  let missingEvents = 0;
  for (const event of events) {
    const at = Date.parse(event.at);
    const index = lowerBound(event.phase === 'open' ? starts : ends, at);
    if (index === bars.length || (event.phase === 'open' ? starts[index] !== at : starts[index] >= at)) { missingEvents++; continue; }
    const slot = slots.get(index) ?? []; slot.push(event); slots.set(index, slot);
  }
  if (!slots.size) return { bars, steps: [] as ReplayStep[], missingEvents };
  const indices = [...slots.keys()];
  const first = Math.max(0, Math.min(...indices) - 2);
  const closed = events.some(e => e.kind === 'exit' && e.remainingQuantity === 0);
  const last = closed ? Math.max(...indices) : bars.length - 1;
  const steps: ReplayStep[] = [];
  for (let bar = first; bar <= last; bar++) {
    const found = (slots.get(bar) ?? []).sort((a,b) => a.sequence - b.sequence);
    for (const phase of ['open', 'close'] as const) {
      const at = phase === 'open' ? start(bars[bar]) : barEnd(bars[bar].time, view.timeframe);
      steps.push({ bar, phase, at });
      for (const event of found.filter(e => e.phase === phase)) steps.push({ bar, phase, at, event });
    }
  }
  return { bars, steps, missingEvents };
}

export function replayFrame(bars: ChartBar[], steps: ReplayStep[], index: number) {
  const step = steps[index];
  if (!step) return null;
  // A synthetic open-only display is explicitly labelled. No high/low/volume from later in this candle.
  const current = bars[step.bar];
  const visible = bars.slice(Math.max(0, step.bar - 599), step.bar + 1);
  if (step.phase === 'open') visible[visible.length - 1] = { ...current, high: current.open, low: current.open, close: current.open, volume: 0 };
  const revealed = steps.slice(0, index + 1).filter(s => s.event);
  let quantity = 0, realized = 0, entry: ReplayEvent | undefined, stop: number | undefined, pendingStop: number | undefined;
  const filledTargets = new Set<number>();
  const markers: ChartEvent[] = [];
  for (const s of revealed) {
    const e = s.event!;
    if (e.kind === 'entry') { entry = e; quantity = e.quantity ?? 0; stop = e.stop; }
    if (e.kind === 'exit') {
      quantity = e.remainingQuantity ?? Math.max(0, quantity - (e.quantity ?? 0)); realized += e.pnl ?? 0;
      const n = /^Target(?: (\d+))?$/.exec(e.reason ?? ''); if (n) filledTargets.add(Number(n[1] ?? 1));
    }
    if (e.kind === 'stop') {
      if (step.bar > s.bar) { stop = e.stop; pendingStop = undefined; } else pendingStop = e.stop;
    }
    if (e.kind !== 'stop') markers.push({ id: `replay-${e.sequence}`, kind: e.kind === 'signal' ? 'signal' : 'backtest',
      side: e.side ?? (e.kind === 'exit' ? 'SELL' : 'BUY'), at: e.kind === 'signal' ? e.at : e.fillAt ?? e.at,
      price: e.price, quantity: e.quantity, label: e.reason ?? e.kind });
  }
  const levels: ChartLevel[] = quantity && entry ? [
    { id: 'entry', label: 'Entry', price: entry.price!, kind: 'entry' },
    ...(stop == null ? [] : [{ id: 'stop', label: 'Active stop', price: stop, kind: 'stop' as const }]),
    ...(entry.targets ?? []).filter(t => t.quantity > 0 && !filledTargets.has(t.number)).map(t => ({ id: `t${t.number}`, label: `T${t.number}`, price: t.price, kind: 'target' as const })),
  ] : [];
  return { step, bars: visible, markers, levels, quantity, realized, entry, stop, pendingStop };
}
