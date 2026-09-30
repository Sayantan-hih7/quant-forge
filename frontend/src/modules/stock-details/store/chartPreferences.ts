import { volumeStyleSchema, type VolumeStyle } from '../utils/volumeSettings';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';
import { defaultIndicators, type ChartIndicator } from '../utils/chartIndicators';
import { indicatorSettingsSchema } from '../utils/indicatorSettings';
import type { StockTimeframe } from '../types';

export interface ChartProfile { custom: ChartIndicator[]; kind: 'candles' | 'line'; timeframe?: StockTimeframe; showVolume?: boolean; volumeStyle?: VolumeStyle }
export type ChartProfileMode = 'research' | 'strategy';
const profileSchema = z.object({ custom: z.array(indicatorSettingsSchema).max(12), kind: z.enum(['candles', 'line']), timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo']).optional(), showVolume: z.boolean().default(true), volumeStyle: volumeStyleSchema.optional() });
const savedSchema = z.object({ favourites: z.array(z.string().max(50)).max(50).default([]), research: profileSchema, strategy: profileSchema, overviewKind: z.enum(['candles', 'line']).default('line'), layouts: z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(40), profile: profileSchema })).max(10) });
interface Preferences {
  favourites: string[]; toggleFavourite: (key: string) => void;
  research: ChartProfile; strategy: ChartProfile;
  overviewKind: 'candles' | 'line';
  setOverviewKind: (kind: 'candles' | 'line') => void;
  layouts: { id: string; name: string; profile: ChartProfile }[];
  update: (mode: ChartProfileMode, change: Partial<ChartProfile>) => void;
  saveLayout: (name: string, profile: ChartProfile) => void;
  removeLayout: (id: string) => void;
}
export const useChartPreferences = create<Preferences>()(persist((set) => ({
  favourites: [], toggleFavourite: key => set(s => ({ favourites: s.favourites.includes(key) ? s.favourites.filter(k=>k!==key) : s.favourites.length<50 ? [...s.favourites,key] : s.favourites })),
  research: { custom: defaultIndicators, kind: 'candles', showVolume: true }, strategy: { custom: [], kind: 'candles', showVolume: true }, layouts: [],
  overviewKind: 'line', setOverviewKind: overviewKind => set({ overviewKind }),
  update: (mode, change) => set(s => ({ [mode]: { ...s[mode], ...change } })),
  saveLayout: (name, profile) => set(s => {
    const kept = s.layouts.filter(l => l.name.toLowerCase() !== name.toLowerCase());
    return kept.length >= 10 ? s : { layouts: [...kept, { id: crypto.randomUUID(), name, profile }] };
  }),
  removeLayout: id => set(s => ({ layouts: s.layouts.filter(l => l.id !== id) })),
}), {
  name: 'quantforge-chart-preferences', version: 1,
  partialize: s => ({ favourites: s.favourites, research: s.research, strategy: s.strategy, overviewKind: s.overviewKind, layouts: s.layouts }),
  merge: (persisted, current) => { const parsed = savedSchema.safeParse(persisted); return parsed.success ? { ...current, ...parsed.data } : current; },
}));
