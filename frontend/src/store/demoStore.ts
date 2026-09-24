import { create } from "zustand";
import { mockStrategies } from "../modules/strategies/api/mockStrategies";
import type { Strategy } from "../modules/strategies/types";
interface DemoState {
  strategies: Strategy[];
  enginePaused: boolean;
  addStrategy: (strategy: Strategy) => void;
  setStrategyMode: (id: string, mode: Strategy["mode"]) => void;
  setEnginePaused: (paused: boolean) => void;
}
// Session-only: reloading restores the original demo fixtures.
export const useDemoStore = create<DemoState>((set) => ({
  strategies: mockStrategies,
  enginePaused: false,
  addStrategy: (strategy) =>
    set((s) => ({ strategies: [...s.strategies, strategy] })),
  setStrategyMode: (id, mode) =>
    set((s) => ({
      strategies: s.strategies.map((item) =>
        item.id === id ? { ...item, mode } : item,
      ),
    })),
  setEnginePaused: (enginePaused) => set({ enginePaused }),
}));
