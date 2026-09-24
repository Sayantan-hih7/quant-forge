import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import type { QuoteStatus, StockQuote } from '../types';

export function useStockQuotes(ids: string[], enabled = true) {
  const key = [...new Set(ids)].sort().join(',');
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [status, setStatus] = useState<QuoteStatus>({ state: 'connecting' });
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!key || !enabled) return;
    let disposed = false, stream: EventSource | undefined, loading = false;
    const controller = new AbortController();
    const accept = (incoming: StockQuote[]) => {
      if (disposed) return;
      setQuotes(previous => {
        const next = { ...previous };
        for (const quote of incoming) {
          const old = next[quote.instrumentId];
          if ((!old?.lastTradeAt || quote.lastTradeAt && quote.lastTradeAt >= old.lastTradeAt) && (!old || quote.receivedAt >= old.receivedAt || (quote.lastTradeAt ?? '') > (old.lastTradeAt ?? ''))) next[quote.instrumentId] = quote;
        }
        return next;
      });
    };
    async function snapshot() {
      if (loading || disposed || document.hidden) return;
      loading = true;
      try {
        const { data } = await apiClient.get<{ quotes: StockQuote[]; message?: string }>('/stocks/quotes', { params: { ids: key }, signal: controller.signal });
        if (disposed) return;
        accept(data.quotes); setError(data.message);
        if (!stream && !document.hidden) {
          stream = new EventSource(`/api/stocks/stream?ids=${encodeURIComponent(key)}`, { withCredentials: true });
          stream.onmessage = event => {
            if (disposed) return;
            try {
              const data = JSON.parse(event.data) as { quotes?: StockQuote[]; status?: QuoteStatus };
              if (data.quotes) accept(data.quotes);
              if (data.status) setStatus(data.status);
            } catch { /* malformed transport data never becomes a displayed price */ }
          };
          stream.onerror = () => { if (!disposed) setStatus({ state: 'reconnecting', message: 'Reconnecting. Last received prices remain visible.' }); };
        }
      } catch (cause) { if (!disposed && !controller.signal.aborted) { setError((cause as Error).message); if (!stream) setStatus({ state: 'unavailable' }); } }
      finally { loading = false; }
    }
    function visibility() {
      if (document.hidden) { stream?.close(); stream = undefined; setStatus({ state: 'connecting' }); }
      else void snapshot();
    }
    void snapshot();
    const refresh = window.setInterval(() => { void snapshot(); }, 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 2000);
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; controller.abort(); stream?.close(); clearInterval(refresh); clearInterval(clock); document.removeEventListener('visibilitychange', visibility); };
  }, [key, enabled]);
  return { quotes, status, error, now };
}
