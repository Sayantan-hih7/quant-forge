import { create } from "zustand";
import { persist } from "zustand/middleware";
export type ThemeMode = "light" | "dark" | "system";
interface UiState {
  themeMode: ThemeMode;
  collapsed: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleSidebar: () => void;
}
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: "system",
      collapsed: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleSidebar: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    { name: "quantforge-ui", version: 1 },
  ),
);
