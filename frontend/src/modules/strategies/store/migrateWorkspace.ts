import { evaluateMockLayer, qualifyMockLayer } from '../api/mockUniverse';
import { qualificationDefaults, tradingTemplates } from '../config/tradingTemplates';
import type { MonthlyBase, StrategyWorkspace, TradingLayerConfig } from '../types/workspace';

interface PersistedWorkspaces {
  workspaces: Record<string, StrategyWorkspace>;
}

// The v2 migration erased the original demo watchlists. Repair only its exact
// untouched seed shape, preserving custom rules and deliberately invalidated lists.
function restoreDefaultDemoWatchlists(base: MonthlyBase): MonthlyBase {
  if (base.id !== 'base-core' || base.current.id !== 'base-core-v1' || base.current.version !== 1 || base.history.length || base.layers.length !== 3) return base;
  const fields: (keyof TradingLayerConfig)[] = ['name', 'horizon', 'timeframe', 'qualificationRule', 'qualificationCadence', 'entryRule', 'exitRule'];
  const isUntouched = base.layers.every((layer, index) => {
    const template = tradingTemplates[index];
    return layer.id === `base-core-layer-${index}` && layer.templateId === template.id &&
      layer.mode === 'PAPER' && layer.status === (index === 2 ? 'paused' : 'active') &&
      layer.watchlist === null && layer.evaluation === null &&
      fields.every((field) => layer[field] === template[field as keyof typeof template]);
  });
  if (!isUntouched) return base;
  const time = Date.parse(base.current.qualifiedAt);
  return {
    ...base,
    layers: base.layers.map((layer) => {
      const restored = { ...layer, watchlist: qualifyMockLayer(layer, base.current, time) };
      return { ...restored, evaluation: layer.status === 'active' ? evaluateMockLayer(restored, base.current, time) : null };
    }),
  };
}

export function migrateWorkspace(persisted: unknown, version: number): PersistedWorkspaces {
  const previous = persisted as PersistedWorkspaces;
  if (version > 2) return previous;
  return {
    workspaces: Object.fromEntries(Object.entries(previous.workspaces ?? {}).map(([owner, workspace]) => [owner, {
      ...workspace,
      bases: workspace.bases.map((base) => {
        const normalized = version < 2 ? {
          ...base,
          layers: base.layers.map((layer) => ({ ...qualificationDefaults[layer.horizon], ...layer, watchlist: null, evaluation: null })),
        } : base;
        return restoreDefaultDemoWatchlists(normalized);
      }),
    }])),
  };
}
