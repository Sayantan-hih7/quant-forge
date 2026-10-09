import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import { indicatorFrame, type ChartIndicator } from '../utils/chartIndicators';
import type { StockChartData, StockTimeframe } from '../types';

export const benchmarkKey = (i: ChartIndicator, frame: StockTimeframe) => `${(i.strategy ? i.strategySettings?.benchmark : i.benchmark) ?? 'NIFTY 50'}:${indicatorFrame(i, frame)}`;
export function useBenchmarkHistory(configs: ChartIndicator[], frame: StockTimeframe, from?: string, at?: string) {
  const requests = [...new Set(configs.filter(i => ['relativeStrength','benchmarkClose','benchmarkEma'].includes(i.kind)).map(i => benchmarkKey(i, frame)))].sort();
  const identity = JSON.stringify([requests, from, at]);
  const [state, setState] = useState<{ identity: string; data: Record<string, StockChartData>; errors: string[]; errorsByKey: Record<string, string> }>();
  useEffect(() => {
    if (!from) return;
    const [keys] = JSON.parse(identity) as [string[]];
    if (!keys.length) return;
    const abort = new AbortController(); let busy = false;
    async function load() {
      if (busy || document.hidden) return;
      busy = true;
      const rows = await Promise.all(keys.map(async key => {
        const [name, timeframe] = key.split(':');
        try {
          const { data } = await apiClient.get<StockChartData>(`/stocks/benchmarks/${encodeURIComponent(name)}/chart`, { params: { timeframe, from, at }, signal: abort.signal, timeout: 120000 });
          return { key, data };
        } catch (e) { return { key, error: (e as Error).message }; }
      }));
      if (!abort.signal.aborted) setState({ identity, data: Object.fromEntries(rows.filter(x => x.data).map(x => [x.key, x.data!])), errors: rows.flatMap(x => x.error ? [x.error] : x.data?.message ? [x.data.message] : []), errorsByKey: Object.fromEntries(rows.filter(x => x.error || x.data?.message).map(x => [x.key, (x.error ?? x.data?.message)!])) });
      busy = false;
    }
    void load();
    const timer = at ? undefined : setInterval(() => void load(), 300000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [identity, from, at]);
  return state?.identity === identity ? { ...state, loading: false } : { data: {} as Record<string, StockChartData>, errors: [], errorsByKey: {} as Record<string, string>, loading: !!requests.length };
}
