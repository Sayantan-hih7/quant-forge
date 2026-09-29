import { create } from 'zustand';
// Deliberately memory-only: credentials and session tokens never enter browser storage.
export const useWorkspaceSession = create<{ hosted: boolean; authenticated: boolean; setSession: (hosted: boolean, authenticated: boolean) => void }>(set => ({
  hosted: false, authenticated: false, setSession: (hosted, authenticated) => set({ hosted, authenticated }),
}));
