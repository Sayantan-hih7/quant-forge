import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { requestAiProposal, type AiInput, type AiStatus } from '../services/aiAssistant';

export function useAiAssistant() {
  const [status, setStatus] = useState<AiStatus>();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const abortPending = useCallback(() => { generation.current++; request.current?.abort(); request.current = null; }, []);
  const cancel = useCallback(() => { abortPending(); setBusy(false); }, [abortPending]);
  useEffect(() => {
    const controller = new AbortController();
    void apiClient.get<AiStatus>('/ai/status', { signal: controller.signal }).then(result => setStatus(result.data)).catch(error => { if (!controller.signal.aborted) setError((error as Error).message); });
    return () => { controller.abort(); abortPending(); };
  }, [abortPending]);
  const send = async <T,>(input: AiInput, validate: (value: unknown) => T) => {
    if (request.current) return null;
    const controller = new AbortController(), id = ++generation.current;
    request.current = controller; setBusy(true); setError(undefined);
    try {
      const result = await requestAiProposal(input, validate, controller.signal);
      return !controller.signal.aborted && id === generation.current ? result : null;
    } catch (error) { if (!controller.signal.aborted && id === generation.current) setError((error as Error).message); return null; }
    finally { if (id === generation.current) { request.current = null; setBusy(false); } }
  };
  return { status, busy, error, send, cancel };
}
