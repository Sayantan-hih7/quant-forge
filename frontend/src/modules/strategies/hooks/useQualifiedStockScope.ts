import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';

export interface ScopedStock { _id: string; symbol: string; exchange: string; source: 'scan' | 'manual' }
export function useQualifiedStockScope(input: { universe: 'current' | 'historical'; includeManual: boolean; from?: string; to?: string }) {
  const [attempt, setAttempt] = useState(0);
  const query = new URLSearchParams({ universe: input.universe, includeManual: String(input.includeManual), ...(input.universe === 'historical' ? { from: input.from ?? '', to: input.to ?? '' } : {}) }).toString();
  const key = `${query}:${attempt}`;
  const [state, setState] = useState<{ key: string; stocks: ScopedStock[]; listCount: number; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    void apiClient.get<{ stocks: ScopedStock[]; listCount: number }>(`/backtests/universe?${query}`, { signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setState({ key, ...r.data }); })
      .catch(e => { if (!controller.signal.aborted) setState({ key, stocks: [], listCount: 0, error: (e as Error).message }); });
    return () => controller.abort();
  }, [query, key]);
  return { stocks: state?.key === key ? state.stocks : [], loading: state?.key !== key, error: state?.key === key ? state.error : undefined,
    listCount: state?.key === key ? state.listCount : 0, retry: () => setAttempt(n => n + 1) };
}
