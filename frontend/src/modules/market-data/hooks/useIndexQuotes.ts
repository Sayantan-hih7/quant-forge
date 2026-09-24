import { useEffect } from 'react';
import { create } from 'zustand';
import { apiClient } from '../../../services/apiClient';
import { indexCatalog } from '../config/indices';
import type { IndexQuote, IndexExchange } from '../types/indices';

const emptyQuotes: IndexQuote[] = indexCatalog.map(index => ({ ...index, last: null, change: null, percent: null,
  previousClose: null, open: null, high: null, low: null, high52w: null, low52w: null,
  series: [], points: [], status: 'unavailable' }));
interface SourceStatus { exchange: IndexExchange; refreshing: boolean; checkedAt: string | null; warning: string | null }
interface State {
  quotes: IndexQuote[]; sources: SourceStatus[]; loading: boolean; error?: string;
  refreshAfterMs: number; refreshedAt: number; refresh: () => Promise<void>;
  autoUpdate: boolean; setAutoUpdate: (enabled: boolean) => void;
}
let pending: Promise<void> | undefined;
export const useIndexStore = create<State>((set) => ({
  quotes: emptyQuotes, sources: [], loading: true, refreshAfterMs: 3000, refreshedAt: 0,
  autoUpdate: true, setAutoUpdate: autoUpdate => set({ autoUpdate }),
  refresh: () => {
    if (pending) return pending;
    set({ loading: true });
    pending = (async () => {
      try {
        const { data } = await apiClient.get<{ quotes: IndexQuote[]; sources: SourceStatus[]; refreshAfterMs: number }>('/market-indices');
        const byId = new Map(data.quotes.map(q => [q.id, q]));
        set(state => ({ quotes: emptyQuotes.map(index => {
          const next = { ...index, ...byId.get(index.id) }; const previous = state.quotes.find(q => q.id === index.id);
          const tickDirection = previous?.last != null && next.last !== null && previous.last !== next.last ? next.last > previous.last ? 'up' as const : 'down' as const : undefined;
          return { ...next, tickDirection };
        }), sources: data.sources, loading: false, error: undefined, refreshAfterMs: data.refreshAfterMs, refreshedAt: Date.now() }));
      } catch (error) {
        set(state => ({ loading: false, error: (error as Error).message, refreshAfterMs: 15_000, refreshedAt: Date.now(),
          quotes: state.quotes.map(q => ({ ...q, status: q.last === null ? 'unavailable' : q.status === 'eod' ? 'eod' : 'stale' })) }));
      }
    })().finally(() => { pending = undefined; });
    return pending;
  },
}));

// One timer shared by the page and any stock-tag popovers. Pause while the tab is hidden.
let listeners = 0;
let timer: ReturnType<typeof setInterval> | undefined;
function poll() {
  const state = useIndexStore.getState();
  if (!document.hidden && (state.autoUpdate || !state.refreshedAt) && Date.now() - state.refreshedAt >= state.refreshAfterMs) void state.refresh();
}
export function useIndexQuotes() {
  const state = useIndexStore();
  useEffect(() => {
    if (++listeners === 1) {
      poll(); timer = setInterval(poll, 1000); document.addEventListener('visibilitychange', poll);
    }
    return () => { if (--listeners === 0) { clearInterval(timer); document.removeEventListener('visibilitychange', poll); } };
  }, []);
  return state;
}
