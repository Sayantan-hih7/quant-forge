import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import type { DiscoveryState } from '../types';

export function useDiscovery(enabled: boolean, exchange?: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ exchange?: string; data?: DiscoveryState; error?: string }>({});
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, busy = false, explicit = revision > 0;
    async function fetch() {
      if (busy || controller.signal.aborted) return;
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(() => void fetch(), 30_000); return; }
      busy = true;
      try {
        const params = new URLSearchParams();
        if (exchange) params.set('exchange', exchange);
        if (explicit) params.set('refresh', '1');
        explicit = false;
        const { data } = await apiClient.get<DiscoveryState>(`/stock-discovery?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({ exchange, data });
        const delay = data.refreshing ? 3000 : data.market?.open ? 30_000 : data.market?.nextOpenAt ? Math.max(1000, Date.parse(data.market.nextOpenAt) - Date.now()) : undefined;
        if (delay !== undefined) timer = setTimeout(() => void fetch(), Math.min(delay, 2_000_000_000));
      } catch (error) {
        if (!controller.signal.aborted) {
          setState(old => ({ exchange, data: old.exchange === exchange ? old.data : undefined, error: (error as Error).message }));
          timer = setTimeout(() => void fetch(), 60_000);
        }
      } finally { busy = false; }
    }
    void fetch();
    const visible = () => { if (!document.hidden) void fetch(); };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [enabled, exchange, revision]);
  return { data: state.exchange === exchange ? state.data : undefined, error: state.exchange === exchange ? state.error : undefined, retry: () => setRevision(value => value + 1) };
}
