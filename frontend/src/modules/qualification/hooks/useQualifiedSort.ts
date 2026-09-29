import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import type { StockQuote } from '../../stock-details/types';
export type QualifiedSortField = 'stock' | 'source' | 'sector' | 'delivery' | 'price' | 'percent';
// Fetch snapshots only when a price sort is requested. Streaming remains limited to the visible page.
export function useQualifiedSort(ids: string[], field: QualifiedSortField) {
  const key = ['price', 'percent'].includes(field) ? [...ids].sort().join(',') : '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; quotes: Record<string, StockQuote>; error?: string }>({ key: '', attempt: 0, quotes: {} });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    void (async () => {
      const quotes: Record<string, StockQuote> = {}, selection = key.split(',');
      let error: string | undefined;
      for (let i = 0; i < selection.length && !controller.signal.aborted; i += 100) {
        try {
          const { data } = await apiClient.get<{ quotes: StockQuote[]; message?: string }>('/stocks/quotes', { params: { ids: selection.slice(i, i + 100).join(',') }, signal: controller.signal });
          data.quotes.forEach(q => { quotes[q.instrumentId] = q; });
          if (data.message) error = data.message;
        } catch (cause) { error = (cause as Error).message; }
      }
      if (!controller.signal.aborted) setResult({ key, attempt, quotes, error });
    })();
    return () => controller.abort();
  }, [key, attempt]);
  const current = result.key === key && result.attempt === attempt;
  return { quotes: current ? result.quotes : {}, loading: !!key && !current, error: current ? result.error : undefined, refresh: () => setAttempt(n => n + 1) };
}
