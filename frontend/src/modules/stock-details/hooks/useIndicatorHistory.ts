import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import type { StockChartData, StockTimeframe } from '../types';
import type { HistoryNeed } from '../utils/indicatorSettings';
const emptyHistory: Partial<Record<StockTimeframe, StockChartData>> = {};

export function useIndicatorHistory(instrumentId: string, frames: StockTimeframe[], historyAt?: string, historyPath?: string, needs: Partial<Record<StockTimeframe, HistoryNeed>> = {}) {
  const key = [...new Set(frames)].sort().join(','), requirements = JSON.stringify(needs), identity = `${instrumentId}:${key}:${historyAt ?? ''}:${historyPath ?? ''}:${requirements}`;
  const [state, setState] = useState<{ identity: string; data: Partial<Record<StockTimeframe, StockChartData>>; errors: string[] }>({ identity: '', data: {}, errors: [] });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController(); let busy = false;
    async function load() {
      if (busy || document.hidden) return; busy = true;
      const requested = key.split(',') as StockTimeframe[];
      const parsed = JSON.parse(requirements) as Partial<Record<StockTimeframe, HistoryNeed>>;
      const results = await Promise.allSettled(requested.map(frame => apiClient.get<StockChartData>(historyPath ?? `/stocks/${encodeURIComponent(instrumentId)}/chart`, { params: { timeframe: frame, at: historyAt, ...(!historyPath ? parsed[frame] : {}) }, signal: controller.signal, timeout: 120_000 })));
      if (!controller.signal.aborted) setState(old => {
        const data = old.identity === identity ? { ...old.data } : {}, errors: string[] = [];
        results.forEach((r,i) => { if (r.status === 'fulfilled') data[requested[i]] = r.value.data; else errors.push(`${requested[i]} indicator history: ${(r.reason as Error).message}`); });
        return { identity, data, errors };
      });
      busy = false;
    }
    void load(); const timer = historyAt ? undefined : setInterval(() => void load(), 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [instrumentId, identity, key, historyAt, historyPath, requirements]);
  return state.identity === identity ? { ...state, loading: false } : { data: emptyHistory, errors: [], loading: !!key };
}
