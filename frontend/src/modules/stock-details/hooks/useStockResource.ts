import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../services/apiClient';

export function useStockResource<T>(path: string | null, refreshMs = 0, refreshIf?: (data:T|undefined)=>boolean, retryQuery = '') {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string; loading: boolean }>({ path: '', loading: true });
  const retryPath = useRef<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    const requestPath = path;
    const controller = new AbortController();
    let busy = false;
    let lastData:T|undefined;
    async function fetch() {
      if (busy || document.hidden) return;
      busy = true;
      const url = retryPath.current === requestPath && retryQuery ? `${requestPath}${requestPath.includes('?') ? '&' : '?'}${retryQuery}` : requestPath;
      retryPath.current = null;
      try {
        const { data } = await apiClient.get<T>(url, { signal: controller.signal, timeout: 120_000 });
        lastData=data;
        if (!controller.signal.aborted) setResult({ path: requestPath, data, loading: false });
      } catch (error) {
        if (!controller.signal.aborted) setResult(old => ({ path: requestPath, data: old.path === requestPath ? old.data : undefined, loading: false, error: (error as Error).message }));
      } finally { busy = false; }
    }
    void fetch();
    const timer = refreshMs ? window.setInterval(() => { if(!refreshIf||refreshIf(lastData))void fetch(); }, refreshMs) : undefined;
    const visible = () => { if (!document.hidden) void fetch(); };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [path, refreshMs, revision,refreshIf,retryQuery]);
  return { data: result.path === path ? result.data : undefined, error: result.path === path ? result.error : undefined, loading: !!path && (result.path !== path || result.loading),
    retry: () => { retryPath.current = path; setResult(old => ({ ...old, loading: true, error: undefined })); setRevision(x => x + 1); } };
}
