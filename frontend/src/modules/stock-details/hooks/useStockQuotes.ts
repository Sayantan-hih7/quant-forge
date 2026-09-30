import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import type { LiveChartBar, QuoteStatus, StockQuote } from '../types';

export function useStockQuotes(ids: string[], enabled = true, candles = false) {
  const key = [...new Set(ids)].sort().join(',');
  const identity = `${key}:${enabled}:${candles}`;
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [transport, setTransport] = useState<{ identity: string; status: QuoteStatus }>({ identity: '', status: { state: 'connecting' } });
  const [failure, setFailure] = useState<{ identity: string; error?: string }>();
  const [now, setNow] = useState(Date.now);
  const [liveBars, setLiveBars] = useState<Record<string, LiveChartBar[]>>({});
  useEffect(() => {
    if (!key || !enabled) return;
    const setStatus = (status: QuoteStatus) => setTransport({ identity, status });
    const setError = (error?: string) => setFailure({ identity, error });
    let disposed = false, stream: EventSource | undefined, loading = false;
    let sessions: Record<string, string> | undefined;
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
    function connectStream() {
        if (!stream && !document.hidden) {
          stream = new EventSource(`/api/stocks/stream?ids=${encodeURIComponent(key)}${candles ? '&candles=true' : ''}`, { withCredentials: true });
          stream.onmessage = event => {
            if (disposed) return;
            try {
              const data = JSON.parse(event.data) as { quotes?: StockQuote[]; candles?: LiveChartBar[]; status?: QuoteStatus };
              if (data.quotes) accept(data.quotes);
              if (data.status) {
                setStatus(data.status);
                if (JSON.stringify(sessions) !== JSON.stringify(data.status.sessions) || data.status.state !== 'streaming') {
                  const nextSessions = data.status.sessions;
                  const oldSessions = sessions;
                  setLiveBars(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => data.status?.state === 'streaming' && oldSessions?.[id] && oldSessions[id] === nextSessions?.[id])));
                }
                sessions = data.status.sessions;
              }
              if (data.candles && candles) setLiveBars(previous => {
                const next = { ...previous };
                for (const id of new Set(data.candles!.map(b => b.instrumentId))) {
                  const bars = new Map((next[id] ?? []).map(b => [b.time, b]));
                  for (const bar of data.candles!) if (bar.instrumentId === id) bars.set(bar.time, bar);
                  next[id] = [...bars.values()].sort((a, b) => a.time.localeCompare(b.time)).slice(-400);
                }
                return next;
              });
            } catch { /* malformed transport data never becomes a displayed price */ }
          };
          stream.onerror = () => { if (!disposed) { setStatus({ state: 'reconnecting', sessions: {}, message: 'Reconnecting. Last received prices remain visible.' }); setLiveBars({}); } };
        }
    }
    async function snapshot() {
      if (loading || disposed || document.hidden) return;
      loading = true;
      try {
        const { data } = await apiClient.get<{ quotes: StockQuote[]; message?: string }>('/stocks/quotes', { params: { ids: key }, signal: controller.signal });
        if (disposed) return;
        accept(data.quotes); setError(data.message);
      } catch (cause) { if (!disposed && !controller.signal.aborted) { setError((cause as Error).message); if (!stream) setStatus({ state: 'unavailable' }); } }
      finally { loading = false; }
    }
    function visibility() {
      if (document.hidden) { stream?.close(); stream = undefined; setStatus({ state: 'connecting' }); setLiveBars({}); }
      else { connectStream(); void snapshot(); }
    }
    connectStream(); void snapshot();
    const refresh = window.setInterval(() => { void snapshot(); }, 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 2000);
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; controller.abort(); stream?.close(); clearInterval(refresh); clearInterval(clock); document.removeEventListener('visibilitychange', visibility); };
  }, [key, enabled, candles, identity]);
  // Keep last received quotes by instrument, but never reuse another selection's
  // connection state or live candle previews while its replacement connects.
  const status: QuoteStatus = transport.identity === identity ? transport.status : { state: 'connecting' };
  return { quotes, status, error: failure?.identity === identity ? failure.error : undefined, now,
    liveBars: transport.identity === identity ? liveBars : {} };
}
