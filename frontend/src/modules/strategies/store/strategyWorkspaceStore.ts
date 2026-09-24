import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSeedWorkspace, evaluateMockLayer, qualifyMockLayer, qualifyMockUniverse } from '../api/mockUniverse';
import { migrateWorkspace } from './migrateWorkspace';
import { monthKey, isRefreshDue } from '../utils/monthlyCycle';
import type { MonthlyBase, QualificationRules, StrategyWorkspace, TradingLayerConfig } from '../types/workspace';

interface WorkspaceState {
  workspaces: Record<string, StrategyWorkspace>;
  initialize: (owner: string, time: number) => void;
  selectBase: (owner: string, id: string) => void;
  createBase: (owner: string, name: string, rules: QualificationRules, time: number) => string;
  planRules: (owner: string, baseId: string, rules: QualificationRules) => void;
  refreshMonth: (owner: string, baseId: string, time: number) => boolean;
  saveLayer: (owner: string, baseId: string, config: TradingLayerConfig, layerId?: string) => void;
  toggleLayer: (owner: string, baseId: string, layerId: string) => void;
  removeLayer: (owner: string, baseId: string, layerId: string) => void;
  qualifyLayers: (owner: string, baseId: string, time: number, layerId?: string) => void;
  evaluate: (owner: string, baseId: string, time: number, layerId?: string) => void;
}
export const useStrategyWorkspaceStore = create<WorkspaceState>()(persist((set, get) => {
  const updateBase = (owner: string, id: string, update: (base: MonthlyBase) => MonthlyBase) => set((state) => {
    const workspace = state.workspaces[owner];
    if (!workspace) return state;
    return { workspaces: { ...state.workspaces, [owner]: { ...workspace, bases: workspace.bases.map((base) => base.id === id ? update(base) : base) } } };
  });
  return {
    workspaces: {},
    initialize: (owner, time) => {
      if (!get().workspaces[owner]) set((s) => ({ workspaces: { ...s.workspaces, [owner]: createSeedWorkspace(monthKey(time)) } }));
    },
    selectBase: (owner, id) => set((s) => {
      const workspace = s.workspaces[owner];
      if (!workspace?.bases.some((base) => base.id === id)) return s;
      return { workspaces: { ...s.workspaces, [owner]: { ...workspace, selectedBaseId: id } } };
    }),
    createBase: (owner, name, rules, time) => {
      const id = crypto.randomUUID();
      const month = monthKey(time);
      const base: MonthlyBase = { id, name, current: { id: crypto.randomUUID(), month, version: 1, qualifiedAt: new Date(time).toISOString(), rules: { ...rules }, stocks: qualifyMockUniverse(rules, month) }, history: [], plannedRules: null, layers: [] };
      set((s) => {
        const workspace = s.workspaces[owner] ?? { bases: [], selectedBaseId: id };
        return { workspaces: { ...s.workspaces, [owner]: { bases: [...workspace.bases, base], selectedBaseId: id } } };
      });
      return id;
    },
    planRules: (owner, baseId, rules) => updateBase(owner, baseId, (base) => ({ ...base, plannedRules: { ...rules } })),
    refreshMonth: (owner, baseId, time) => {
      const base = get().workspaces[owner]?.bases.find((item) => item.id === baseId);
      const month = monthKey(time);
      if (!base || !isRefreshDue(base.current.month, month)) return false;
      const rules = base.plannedRules ?? base.current.rules;
      updateBase(owner, baseId, (current) => ({
        ...current, history: [...current.history, current.current], plannedRules: null,
        current: { id: crypto.randomUUID(), month, version: current.current.version + 1, qualifiedAt: new Date(time).toISOString(), rules: { ...rules }, stocks: qualifyMockUniverse(rules, month) },
        layers: current.layers.map((layer) => ({ ...layer, watchlist: null, evaluation: null })),
      }));
      return true;
    },
    saveLayer: (owner, baseId, config, layerId) => updateBase(owner, baseId, (base) => ({
      ...base,
      layers: layerId
        ? base.layers.map((layer) => layer.id === layerId ? {
          ...layer, ...config, evaluation: null,
          watchlist: layer.qualificationRule === config.qualificationRule && layer.qualificationCadence === config.qualificationCadence && layer.horizon === config.horizon ? layer.watchlist : null,
        } : layer)
        : [...base.layers, { ...config, id: crypto.randomUUID(), status: 'active', watchlist: null, evaluation: null }],
    })),
    toggleLayer: (owner, baseId, layerId) => updateBase(owner, baseId, (base) => ({ ...base, layers: base.layers.map((layer) => layer.id === layerId ? { ...layer, status: layer.status === 'active' ? 'paused' : 'active' } : layer) })),
    removeLayer: (owner, baseId, layerId) => updateBase(owner, baseId, (base) => ({ ...base, layers: base.layers.filter((layer) => layer.id !== layerId) })),
    qualifyLayers: (owner, baseId, time, layerId) => updateBase(owner, baseId, (base) => ({
      ...base, layers: base.layers.map((layer) =>
        layer.status === 'active' && (!layerId || layer.id === layerId)
          ? { ...layer, watchlist: qualifyMockLayer(layer, base.current, time), evaluation: null } : layer),
    })),
    evaluate: (owner, baseId, time, layerId) => updateBase(owner, baseId, (base) => ({
      ...base, layers: base.layers.map((layer) =>
        layer.status === 'active' && (!layerId || layer.id === layerId)
          ? { ...layer, evaluation: evaluateMockLayer(layer, base.current, time) } : layer),
    })),
  };
}, {
  name: 'quantforge-strategy-workspaces', version: 3,
  partialize: (s) => ({ workspaces: s.workspaces }),
  migrate: migrateWorkspace,
}));
