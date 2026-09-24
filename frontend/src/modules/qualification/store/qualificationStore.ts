import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createMonthlyCache, createQualificationWorkspace, scanCachedCandidates } from '../api/mockQualification';
import { MARKET_SIZE, mockMarket, restoreMockIndices } from '../api/mockMarket';
import { monthKey } from '../../strategies/utils/monthlyCycle';
import { advanceProgress, isScanActive } from '../utils/scanJobs';
import type { MonthlyCache, QualificationWorkspace, RuleDefinition, ScanJob } from '../types';
import type { MonthlyRuleDefinition } from '../types/monthly';
import { initialMonthlyRule } from '../config/monthlyFields';
import { monthlyRuleSchema } from '../schemas/monthlyRuleSchema';
import { createMonthlySnapshot } from '../api/mockMonthly';
import { nextMonth, previousMonth } from '../../strategies/utils/monthlyCycle';
import { canRunSavedMonthlyRule, monthlyRulesEqual } from '../utils/monthlyRuleChanges';
import { canEditQualifiedStocks, retainManualStocks } from '../utils/manualQualification';
import { tradingPlanSchema } from '../../strategies/schemas/tradingPlanSchema';
import type { TradingPlan, TradingPlanDraft } from '../../strategies/types/tradingPlan';

import { normalizeStrategyPairs } from '../../strategies/utils/strategyPairs';

const restoreCache = (cache: MonthlyCache): MonthlyCache => ({ ...cache, candidates: cache.candidates.map(restoreMockIndices) });

interface QualificationState {
  workspaces: Record<string, QualificationWorkspace>;
  initialize: (owner: string, time: number) => void;
  saveRule: (owner: string, definition: RuleDefinition, id?: string) => string;
  saveTradingPlan: (owner: string, draft: TradingPlanDraft, planId?: string, legacyRuleId?: string) => TradingPlan | null;
  activateBase: (owner: string, id: string) => void;
  selectTactical: (owner: string, id: string) => void;
  setScheduledPreview: (owner: string, enabled: boolean) => void;
  saveMonthlyRule: (owner: string, definition: MonthlyRuleDefinition) => boolean;
  queueBaseScan: (owner: string) => string | null;
  queueTacticalScan: (owner: string, ids: string[]) => string | null;
  advanceScans: (owner: string, now: number) => void;
  cancelScan: (owner: string, id: string) => void;
  retryScan: (owner: string, id: string) => string | null;
  publishScan: (owner: string, id: string) => boolean;
  addQualifiedStocks: (owner: string, month: string, symbols: string[], note?: string) => number;
  removeQualifiedStock: (owner: string, month: string, symbol: string) => boolean;
  removeAllManualStocks: (owner: string, month: string) => number;
  interruptScans: (owner: string) => void;
}
export const useQualificationStore = create<QualificationState>()(persist((set, get) => {
  const update = (owner: string, updater: (workspace: QualificationWorkspace) => QualificationWorkspace) => set((state) => state.workspaces[owner] ? { workspaces: { ...state.workspaces, [owner]: updater(state.workspaces[owner]) } } : state);
  const enqueue = (owner: string, job: ScanJob) => {
    update(owner, (workspace) => ({ ...workspace, jobs: [job, ...workspace.jobs].slice(0, 12) }));
    return job.id;
  };
  const jobBase = () => ({ id: crypto.randomUUID(), status: 'queued' as const, phase: 'queued' as const, createdAt: Date.now(), updatedAt: Date.now(), progress: 0, processed: 0 });
  const occupied = (workspace: QualificationWorkspace, tactical: boolean) => workspace.jobs.some((job) => isScanActive(job) && (job.kind === 'tactical') === tactical);
  return {
    workspaces: {},
    saveTradingPlan: (owner, draft, planId, legacyRuleId) => {
      const parsed = tradingPlanSchema.safeParse(draft);
      const workspace = get().workspaces[owner];
      if (!parsed.success || !workspace) return null;
      const previous = workspace.tradingPlans?.find((plan) => plan.id === planId);
      if (planId && !previous) return null;
      const legacy = workspace.templates.find((rule) => rule.id === legacyRuleId && rule.tier === 'tactical');
      const entryRuleId = previous?.entryRuleId ?? (legacy?.side === 'BUY' ? legacy.id : undefined) ?? crypto.randomUUID();
      const exitRuleId = previous?.exitRuleId ?? (legacy?.side === 'SELL' ? legacy.id : undefined) ?? crypto.randomUUID();
      const value = structuredClone(parsed.data);
      const plan: TradingPlan = { id: previous?.id ?? crypto.randomUUID(), name: value.name, entryRuleId, exitRuleId, risk: value.risk, updatedAt: new Date().toISOString() };
      const pair = [
        { ...value.entry, name: `${value.name} · Buy`, id: entryRuleId, revision: (workspace.templates.find((rule) => rule.id === entryRuleId)?.revision ?? 0) + 1 },
        { ...value.exit, name: `${value.name} · Sell`, id: exitRuleId, revision: (workspace.templates.find((rule) => rule.id === exitRuleId)?.revision ?? 0) + 1 },
      ];
      update(owner, (current) => ({ ...current, templates: [...current.templates.filter((rule) => !pair.some((saved) => saved.id === rule.id)), ...pair], tradingPlans: previous ? (current.tradingPlans ?? []).map(item => item.id === plan.id ? plan : item) : [...(current.tradingPlans ?? []), plan], selectedTacticalId: entryRuleId }));
      return plan;
    },
    initialize: (owner, time) => { if (!get().workspaces[owner]) set((state) => ({ workspaces: { ...state.workspaces, [owner]: createQualificationWorkspace(monthKey(time)) } })); },
    saveRule: (owner, definition, id) => {
      const ruleId = id ?? crypto.randomUUID();
      update(owner, (workspace) => {
        const previous = workspace.templates.find((rule) => rule.id === ruleId);
        const rule = { ...structuredClone(definition), id: ruleId, revision: (previous?.revision ?? 0) + 1 };
        return { ...workspace, templates: previous ? workspace.templates.map((item) => item.id === ruleId ? rule : item) : [...workspace.templates, rule] };
      });
      return ruleId;
    },
    saveMonthlyRule: (owner, definition) => {
      const parsed = monthlyRuleSchema.safeParse(definition);
      if (!parsed.success || !get().workspaces[owner]) return false;
      update(owner, (workspace) => ({ ...workspace, monthlyRuleSaved: true, monthlyRule: monthlyRulesEqual(workspace.monthlyRule, parsed.data) ? workspace.monthlyRule : { ...structuredClone(parsed.data), tier: 'monthly', id: workspace.monthlyRule.id, revision: workspace.monthlyRule.revision + 1 } }));
      return true;
    },
    activateBase: (owner, id) => update(owner, (workspace) => workspace.templates.some((rule) => rule.id === id && rule.tier === 'base') ? { ...workspace, activeBaseId: id } : workspace),
    selectTactical: (owner, id) => update(owner, (workspace) => workspace.templates.some((rule) => rule.id === id && rule.tier === 'tactical') ? { ...workspace, selectedTacticalId: id } : workspace),
    setScheduledPreview: (owner, enabled) => update(owner, (workspace) => ({ ...workspace, scheduledPreview: enabled })),
    queueBaseScan: (owner) => {
      const workspace = get().workspaces[owner];
      const month = monthKey(Date.now());
      if (!workspace || !canRunSavedMonthlyRule(workspace, month) || !monthlyRuleSchema.safeParse(workspace.monthlyRule).success) return null;
      return enqueue(owner, { ...jobBase(), kind: 'monthly', month, dataMonth: previousMonth(month), cacheId: workspace.caches[month]?.id, rules: [structuredClone(workspace.monthlyRule)], scopeCount: MARKET_SIZE });
    },
    queueTacticalScan: (owner, ids) => {
      const workspace = get().workspaces[owner];
      const month = monthKey(Date.now());
      const cache = workspace?.caches[month];
      const rules = workspace?.templates.filter((rule) => ids.includes(rule.id) && rule.tier === 'tactical');
      if (!workspace || !cache?.candidates.length || !rules?.length || occupied(workspace, true)) return null;
      return enqueue(owner, { ...jobBase(), kind: 'tactical', month, cacheId: cache.id, rules: structuredClone(rules), scopeCount: cache.candidates.length });
    },
    advanceScans: (owner, now) => {
      const workspace = get().workspaces[owner];
      if (!workspace?.jobs.some(isScanActive)) return;
      update(owner, (current) => {
        let runs = current.runs;
        const jobs = current.jobs.map((original) => {
          if (!isScanActive(original)) return original;
          const job = advanceProgress(original, now);
          if (job.phase !== 'done') return job;
          try {
            if (job.kind !== 'tactical') {
              if (![monthKey(now), nextMonth(monthKey(now))].includes(job.month)) throw new Error('This target month is now in the past. Start a scan for the current or next month.');
              const rule = job.rules[0];
              const result = rule.tier === 'monthly' ? createMonthlySnapshot(rule, job.month, job.dataMonth!, now) : createMonthlyCache(rule, job.month, now);
              return { ...job, status: 'ready' as const, result: retainManualStocks(result, current.caches[job.month]) };
            }
            if (job.month !== monthKey(now)) throw new Error('The calendar month changed during this scan. Start a new scan for the current month.');
            const cache = current.caches[job.month];
            if (!cache || cache.id !== job.cacheId) throw new Error('The source monthly cache is no longer available. Publish a current cache before retrying.');
            const results = job.rules.filter((rule) => rule.tier !== 'monthly').map((rule) => scanCachedCandidates(cache, rule, now));
            runs = [...results, ...runs].slice(0, 30);
            return { ...job, status: 'completed' as const, signalCount: results.reduce((sum, run) => sum + run.signals.length, 0) };
          } catch (error) { return { ...job, status: 'failed' as const, error: error instanceof Error ? error.message : 'The scan could not complete. Retry with the same saved rules.' }; }
        });
        return { ...current, jobs, runs };
      });
    },
    cancelScan: (owner, id) => update(owner, (workspace) => ({ ...workspace, jobs: workspace.jobs.map((job) => job.id === id && (isScanActive(job) || ['ready', 'failed', 'interrupted'].includes(job.status)) ? { ...job, status: 'cancelled', updatedAt: Date.now(), result: undefined } : job) })),
    retryScan: (owner, id) => {
      const workspace = get().workspaces[owner];
      const original = workspace?.jobs.find((job) => job.id === id);
      if (!workspace || !original || !['failed', 'interrupted', 'cancelled'].includes(original.status) || occupied(workspace, original.kind === 'tactical') || ![monthKey(Date.now()), ...(original.kind !== 'tactical' ? [nextMonth(monthKey(Date.now()))] : [])].includes(original.month)) return null;
      if (original.kind === 'tactical' && workspace.caches[original.month]?.id !== original.cacheId) return null;
      if (original.kind !== 'tactical' && (original.rules[0].tier !== 'monthly' || workspace.jobs.some((job) => job.kind === 'monthly' && job.month === original.month && job.status === 'ready') || workspace.caches[original.month]?.id !== original.cacheId)) return null;
      return enqueue(owner, { ...original, ...jobBase(), result: undefined, error: undefined, signalCount: undefined });
    },
    publishScan: (owner, id) => {
      const workspace = get().workspaces[owner];
      const job = workspace?.jobs.find((item) => item.id === id);
      if (!workspace || !job || job.kind !== 'monthly' || job.rules[0].tier !== 'monthly' || job.status !== 'ready' || !job.result || ![monthKey(Date.now()), nextMonth(monthKey(Date.now()))].includes(job.month) || workspace.caches[job.month]?.id !== job.cacheId) return false;
      update(owner, (current) => ({ ...current, cacheHistory: current.caches[job.month] ? [current.caches[job.month], ...current.cacheHistory].slice(0, 12) : current.cacheHistory, caches: { ...current.caches, [job.month]: job.result! }, jobs: current.jobs.map((item) => item.id === id ? { ...item, status: 'completed', updatedAt: Date.now() } : item) }));
      return true;
    },
    addQualifiedStocks: (owner, month, symbols, note) => {
      const workspace = get().workspaces[owner];
      if (!workspace || !canEditQualifiedStocks(workspace, month, monthKey(Date.now()))) return 0;
      const cache = workspace.caches[month];
      const existing = new Set(cache.candidates.map((stock) => stock.symbol));
      const selected = new Set(symbols);
      const addedAt = new Date().toISOString();
      const additions = mockMarket.filter((stock) => selected.has(stock.symbol) && !existing.has(stock.symbol)).map((stock) => ({ ...stock, qualificationSource: 'manual' as const, manualAddedAt: addedAt, manualSelectionNote: note?.trim().slice(0, 300) || undefined }));
      if (!additions.length) return 0;
      update(owner, (current) => ({ ...current, cacheHistory: [cache, ...current.cacheHistory].slice(0, 12), caches: { ...current.caches, [month]: { ...cache, id: crypto.randomUUID(), createdAt: addedAt, candidates: [...cache.candidates, ...additions] } } }));
      return additions.length;
    },
    removeQualifiedStock: (owner, month, symbol) => {
      const workspace = get().workspaces[owner];
      if (!workspace || !canEditQualifiedStocks(workspace, month, monthKey(Date.now()))) return false;
      const cache = workspace.caches[month];
      if (!cache.candidates.some((stock) => stock.symbol === symbol && stock.qualificationSource === 'manual')) return false;
      update(owner, (current) => ({ ...current, cacheHistory: [cache, ...current.cacheHistory].slice(0, 12), caches: { ...current.caches, [month]: { ...cache, id: crypto.randomUUID(), createdAt: new Date().toISOString(), candidates: cache.candidates.filter((stock) => stock.symbol !== symbol) } } }));
      return true;
    },
    removeAllManualStocks: (owner, month) => {
      const workspace = get().workspaces[owner];
      if (!workspace || !canEditQualifiedStocks(workspace, month, monthKey(Date.now()))) return 0;
      const cache = workspace.caches[month];
      const candidates = cache.candidates.filter((stock) => stock.qualificationSource !== 'manual');
      const removed = cache.candidates.length - candidates.length;
      if (!removed) return 0;
      update(owner, (current) => ({ ...current, cacheHistory: [cache, ...current.cacheHistory].slice(0, 12), caches: { ...current.caches, [month]: { ...cache, id: crypto.randomUUID(), createdAt: new Date().toISOString(), candidates } } }));
      return removed;
    },
    interruptScans: (owner) => update(owner, (workspace) => workspace.jobs.some(isScanActive) ? { ...workspace, jobs: workspace.jobs.map((job) => isScanActive(job) ? { ...job, status: 'interrupted', error: 'The demo session ended before this scan finished. Retry to start a new run.' } : job) } : workspace),
  };
}, {
  name: 'quantforge-qualification', version: 5,
  partialize: (state) => ({ workspaces: state.workspaces }),
  migrate: (persisted) => persisted as QualificationState,
  merge: (persisted, current) => {
    const saved = (persisted as Partial<QualificationState> | undefined)?.workspaces ?? {};
    return { ...current, workspaces: Object.fromEntries(Object.entries(saved).map(([owner, workspace]) => [owner, normalizeStrategyPairs({
      ...workspace,
      monthlyRule: workspace.monthlyRule ?? structuredClone(initialMonthlyRule),
      monthlyRuleSaved: workspace.monthlyRuleSaved ?? false,
      cacheHistory: (workspace.cacheHistory ?? []).map(restoreCache),
      caches: Object.fromEntries(Object.entries(workspace.caches).map(([month, cache]) => [month, restoreCache(cache)])),
      jobs: (workspace.jobs ?? []).map((job) => ({
        ...job,
        ...(job.result ? { result: restoreCache(job.result) } : {}),
        ...(job.kind !== 'tactical' && job.rules[0].tier !== 'monthly' && job.status === 'ready' ? { status: 'cancelled' as const, error: 'Earlier scan retained for reference. Review and save the monthly-only template to start a new scan.' } : {}),
        ...(job.kind === 'tactical' ? { status: 'cancelled' as const } : {}),
        ...(job.kind !== 'tactical' && isScanActive(job) ? { status: 'interrupted' as const, error: 'The demo session ended before this scan finished. Retry to start a new run.' } : {}),
      })),
    })])) };
  },
}));
