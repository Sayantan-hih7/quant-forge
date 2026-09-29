import { useEffect } from 'react';
import { create } from 'zustand';
import { apiClient } from '../../../services/apiClient';
import type { WatchlistState } from '../types';

export interface ActionStock { _id: string; symbol: string; name?: string; exchange: string; isin?: string; active?: boolean }
interface Membership { month: string; revision: number; published: boolean; members: { instrumentId: string; isin: string; source: 'scan' | 'manual' }[] }
interface StockActions {
  watchlists?: WatchlistState; membership?: Membership; error?: string; pending: string[];
  refresh: (afterMutation?: boolean) => Promise<void>; toggle: (stock: ActionStock) => Promise<void>;
}
let inFlight: Promise<void> | undefined;
export const useStockActions = create<StockActions>((set, get) => ({
  pending: [],
  refresh: (afterMutation = false) => {
    // A read begun before a write cannot confirm that write's membership.
    if (inFlight) return afterMutation ? inFlight.then(() => get().refresh()) : inFlight;
    inFlight = Promise.allSettled([
      apiClient.get<WatchlistState>('/watchlists'), apiClient.get<Membership>('/qualification/membership'),
    ]).then(([watchlists, membership]) => {
      set({ watchlists: watchlists.status === 'fulfilled' ? watchlists.value.data : undefined,
        membership: membership.status === 'fulfilled' ? membership.value.data : undefined,
        error: [watchlists, membership].find(result => result.status === 'rejected')?.reason?.message });
    }).finally(() => { inFlight = undefined; });
    return inFlight;
  },
  toggle: async stock => {
    const list = get().watchlists?.lists[0];
    if (!list || get().pending.includes(stock._id)) return;
    set(state => ({ pending: [...state.pending, stock._id] }));
    try {
      const { data } = list.ids.includes(stock._id)
        ? await apiClient.delete(`/watchlists/${list._id}/stocks/${encodeURIComponent(stock._id)}`)
        : await apiClient.post(`/watchlists/${list._id}/stocks`, { instrumentId: stock._id });
      // Refresh after concurrent writes so a slower response cannot lose another addition.
      set(state => ({ watchlists: state.watchlists ? { ...state.watchlists, lists: [data] } : undefined }));
    } finally {
      set(state => ({ pending: state.pending.filter(id => id !== stock._id) }));
      if (!get().pending.length) { await inFlight; await get().refresh(); }
    }
  },
}));

// Load once per active page, not once per row. Other tabs/devices are refreshed on focus.
export function useStockActionData(visible = true) {
  const refresh = useStockActions(state => state.refresh);
  useEffect(() => {
    if (!visible) return;
    void refresh();
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 30_000);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, [refresh, visible]);
}
export function qualifiedMember(stock: ActionStock, membership?: Membership) {
  return membership?.members.find(member => member.instrumentId === stock._id || !!stock.isin && member.isin === stock.isin);
}
