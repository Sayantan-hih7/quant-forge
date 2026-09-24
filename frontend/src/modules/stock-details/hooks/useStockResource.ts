import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';

export function useStockResource<T>(path: string, refreshMs = 0) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string; loading: boolean }>({ path: '', loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function fetch() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const { data } = await apiClient.get<T>(path, { signal: controller.signal, timeout: 120_000 });
        if (!controller.signal.aborted) setResult({ path, data, loading: false });
      } catch (error) {
        if (!controller.signal.aborted) setResult(old => ({ path, data: old.path === path ? old.data : undefined, loading: false, error: (error as Error).message }));
      } finally { busy = false; }
    }
    void fetch();
    const timer = refreshMs ? window.setInterval(() => { void fetch(); }, refreshMs) : undefined;
    const visible = () => { if (!document.hidden) void fetch(); };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [path, refreshMs, revision]);
  return { data: result.path === path ? result.data : undefined, error: result.path === path ? result.error : undefined, loading: result.path !== path || result.loading,
    retry: () => { setResult(old => ({ ...old, loading: true, error: undefined })); setRevision(x => x + 1); } };
}
