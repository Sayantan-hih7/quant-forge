import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StrategyMessage, TradingPlanDraft } from '../types/tradingPlan';

interface Conversation { messages: StrategyMessage[]; draft?: TradingPlanDraft; proposal?: TradingPlanDraft; savedPlanId?: string }
interface StrategyChatState {
  conversations: Record<string, Conversation>;
  update: (key: string, value: Partial<Conversation>) => void;
  clear: (key: string) => void;
}
export const useStrategyChatStore = create<StrategyChatState>()(persist((set) => ({
  conversations: {},
  update: (key, value) => set((state) => ({ conversations: { ...state.conversations, [key]: { ...(state.conversations[key] ?? { messages: [] }), ...value } } })),
  clear: (key) => set((state) => ({ conversations: Object.fromEntries(Object.entries(state.conversations).filter(([id]) => id !== key)) })),
}), { name: 'quantforge-strategy-chat', version: 2, migrate: stored => {
  const old = stored as { conversations?: Record<string, Conversation> };
  // Retain manual drafts, but do not offer old demo suggestions as real AI output.
  return { conversations: Object.fromEntries(Object.entries(old.conversations ?? {}).map(([key, value]) => [key, { draft: value.draft, savedPlanId: value.savedPlanId, messages: [] }])) };
} }));
