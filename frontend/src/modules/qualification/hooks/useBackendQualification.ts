import { useEffect } from 'react';
import { create } from 'zustand';
import { apiClient } from '../../../services/apiClient';
import type { QualificationState, QualifiedStock, RuleCapabilities } from '../types/backend';

interface State {
  data?: QualificationState; stocks: QualifiedStock[]; capabilities?: RuleCapabilities; error?: string; loading: boolean;
  refresh: () => Promise<void>;
}
const useStore = create<State>((set, get) => ({ stocks: [], loading: false, refresh: async () => {
  if (get().loading) return;
  set({ loading: true });
  try {
    const [state, stocks, capabilities] = await Promise.all([
      apiClient.get<QualificationState>('/qualification'), apiClient.get<QualifiedStock[]>('/qualification/universe'),
      apiClient.get<RuleCapabilities>('/market-data/capabilities'),
    ]);
    set({ data: state.data, stocks: stocks.data, capabilities: capabilities.data, error: undefined });
  } catch (error) { set({ error: (error as Error).message }); }
  finally { set({ loading: false }); }
} }));
export function useBackendQualification() {
  const state = useStore();
  const { refresh } = state;
  useEffect(() => {
    void refresh(); const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  return state;
}
