import { useEffect } from 'react';
import { create } from 'zustand';
import { apiClient } from '../../../services/apiClient';
import type { DataStatus } from '../types';

interface SourcesState { data: DataStatus | null; error: string; loading: boolean; refresh: () => Promise<void> }
const useSourcesStore = create<SourcesState>(set => ({
  data: null, error: '', loading: true,
  refresh: async () => {
    try { const response = await apiClient.get<DataStatus>('/market-data/status'); set({ data: response.data, error: '', loading: false }); }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Could not load data sources', loading: false }); }
  },
}));
export function useDataSources() {
  const state = useSourcesStore();
  const refresh = state.refresh;
  useEffect(() => {
    void refresh(); const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return state;
}
