import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useQualificationStore } from '../../qualification/store/qualificationStore';
import { usePaperTradingStore } from '../../paper-trading/store/paperTradingStore';
import { useDemoStore } from '../../../store/demoStore';
import { monthKey } from '../../strategies/utils/monthlyCycle';
import { evaluateMonitor, samplePositions, watchedPositions } from '../api/mockMonitor';
import { closedCandle, definitionKey, demoSessionTime, monitorDefinitions, nextCandle, sessionBounds } from '../utils/monitoring';
import type { MonitorWorkspace, StrategyMonitor } from '../types/monitor';

const source = (owner: string) => {
  const workspace = useQualificationStore.getState().workspaces[owner];
  return { cache: workspace?.caches[monthKey(Date.now())], definitions: monitorDefinitions(workspace), sessions: usePaperTradingStore.getState().sessions[owner] ?? [], globalPaused: useDemoStore.getState().enginePaused };
};
export const idleMonitor = (definition: StrategyMonitor['definition']): StrategyMonitor => ({ definition, state: 'stopped', readyAt: 0, entryPaused: false, checkedCount: 0, lastExitBars: {}, lastProtection: {}, samplePositions: [] });
function resetDemoDay(workspace: MonitorWorkspace, now: number): MonitorWorkspace {
  return { ...workspace, clock: demoSessionTime(now), lastTick: now, lastFeed: undefined, interrupted: true, lastNotice: 'A new demo session is ready. Start monitoring to load fresh sample history.', monitors: Object.fromEntries(Object.entries(workspace.monitors).map(([id, monitor]) => [id, { ...monitor, state: 'stopped' as const }])), signals: workspace.signals.map(signal => signal.disposition === 'ready' ? { ...signal, disposition: 'expired' as const, explanation: 'The previous demo session ended.' } : signal) };
}
function evaluateWorkspace(owner: string, workspace: MonitorWorkspace, manualId?: string): MonitorWorkspace {
  const context = source(owner);
  const monitors = { ...workspace.monitors };
  let signals = workspace.signals;
  for (const [id, monitor] of Object.entries(monitors)) {
    if (manualId && id !== manualId || !manualId && monitor.state !== 'monitoring') continue;
    const result = evaluateMonitor(monitor, { ...context, workspace: { ...workspace, signals }, definition: context.definitions.find(item => item.id === id), manual: !!manualId });
    monitors[id] = result.monitor;
    signals = [...result.signals, ...signals].slice(0, 300);
  }
  signals = signals.map(signal => {
    if (signal.disposition !== 'ready') return signal;
    const monitor = monitors[signal.monitorId];
    const held = monitor ? watchedPositions(monitor, context.sessions) : [];
    const outside = signal.side === 'BUY' && !context.cache?.candidates.some(stock => stock.symbol === signal.symbol);
    const gone = signal.side === 'SELL' && !held.some(position => position.id === signal.positionId);
    if (workspace.clock > signal.expiresAt || outside || gone) return { ...signal, disposition: 'expired' as const, explanation: outside ? 'Stock is no longer eligible for a new monthly-list entry.' : gone ? 'The watched position has been closed or removed.' : 'Signal window elapsed. A new matching candle is required.' };
    const definition = context.definitions.find(item => item.id === signal.monitorId);
    if (signal.side === 'BUY' && held.some(position => position.symbol === signal.symbol)) return { ...signal, disposition: 'blocked' as const, explanation: 'This stock is already held. Another entry would duplicate the position.' };
    const changed = monitor && (!definition || definitionKey(definition) !== definitionKey(monitor.definition));
    const paused = signal.side === 'BUY' && (monitor?.entryPaused || context.globalPaused || changed || context.sessions.some(session => session.entryRule.id === signal.monitorId && session.paused));
    if (workspace.feed !== 'healthy' || paused) return { ...signal, disposition: 'blocked' as const, explanation: workspace.feed !== 'healthy' ? 'Feed unavailable. This alert cannot be acted on; wait for fresh data.' : changed ? 'Saved rules changed. Update this monitor.' : 'New entries paused. Exit checks continue when data is healthy.' };
    return signal;
  });
  return { ...workspace, monitors, signals };
}
interface MonitorState {
  workspaces: Record<string, MonitorWorkspace>;
  initialize: (owner: string) => void;
  select: (owner: string, id: string) => void;
  start: (owner: string, id: string) => boolean;
  stop: (owner: string, id: string) => boolean;
  pauseEntries: (owner: string, id: string, paused: boolean) => void;
  tick: (owner: string, now: number) => void;
  advanceCandle: (owner: string, id: string) => boolean;
  checkLatest: (owner: string, id: string) => boolean;
  setFeed: (owner: string, feed: MonitorWorkspace['feed']) => void;
  toggleSamples: (owner: string, id: string) => void;
  interrupt: (owner: string) => void;
}
export const useSignalMonitorStore = create<MonitorState>()(persist((set, get) => {
  const update = (owner: string, apply: (workspace: MonitorWorkspace) => MonitorWorkspace) => set(state => state.workspaces[owner] ? { workspaces: { ...state.workspaces, [owner]: apply(state.workspaces[owner]) } } : state);
  return {
    workspaces: {},
    initialize: owner => {
      const saved = get().workspaces[owner];
      if (!saved) set(state => ({ workspaces: { ...state.workspaces, [owner]: { clock: demoSessionTime(Date.now()), lastTick: Date.now(), feed: 'healthy', monitors: {}, signals: [], interrupted: false } } }));
      else if (demoSessionTime(saved.clock) !== demoSessionTime(Date.now())) update(owner, workspace => resetDemoDay(workspace, Date.now()));
    },
    select: (owner, id) => update(owner, workspace => ({ ...workspace, selectedId: id })),
    start: (owner, id) => {
      const context = source(owner);
      const definition = context.definitions.find(item => item.id === id);
      const workspace = get().workspaces[owner];
      if (!definition || !workspace || workspace.feed !== 'healthy') return false;
      const previous = workspace.monitors[id] ?? idleMonitor(definition);
      if (!context.cache?.candidates.length && !watchedPositions(previous, context.sessions).length) return false;
      const cursor = definitionKey(previous.definition) !== definitionKey(definition) ? closedCandle(workspace.clock, definition.entry.cadence) : previous.lastEntryBar;
      update(owner, current => ({ ...current, interrupted: false, lastNotice: undefined, lastTick: Date.now(), monitors: { ...current.monitors, [id]: { ...previous, definition: structuredClone(definition), state: 'warming', readyAt: Date.now() + 2500, lastEntryBar: cursor } } }));
      return true;
    },
    stop: (owner, id) => {
      const monitor = get().workspaces[owner]?.monitors[id];
      if (!monitor || watchedPositions(monitor, source(owner).sessions).length) return false;
      update(owner, workspace => ({ ...workspace, monitors: { ...workspace.monitors, [id]: { ...monitor, state: 'stopped' } } })); return true;
    },
    pauseEntries: (owner, id, paused) => update(owner, workspace => workspace.monitors[id] ? evaluateWorkspace(owner, { ...workspace, monitors: { ...workspace.monitors, [id]: { ...workspace.monitors[id], entryPaused: paused } } }) : workspace),
    tick: (owner, now) => {
      const workspace = get().workspaces[owner];
      if (!workspace || !Object.values(workspace.monitors).some(monitor => monitor.state !== 'stopped') && !workspace.signals.some(signal => signal.disposition === 'ready')) return;
      update(owner, current => {
        if (demoSessionTime(current.clock) !== demoSessionTime(now)) return resetDemoDay(current, now);
        const elapsed = Math.max(0, now - current.lastTick);
        // Browser suspension is not background execution. Require an explicit recovery.
        if (elapsed > 20000) return evaluateWorkspace(owner, { ...current, lastTick: now, feed: 'delayed', lastNotice: 'The browser was inactive. Restore the demo feed to resume fresh candle checks.' });
        const clock = Math.min(current.clock + elapsed, sessionBounds(current.clock).end + 300001);
        const monitors = Object.fromEntries(Object.entries(current.monitors).map(([id, monitor]) => [id, monitor.state === 'warming' && now >= monitor.readyAt && current.feed === 'healthy' ? { ...monitor, state: 'monitoring' as const } : monitor]));
        const finishedWarmup = Object.entries(monitors).some(([id, monitor]) => monitor.state === 'monitoring' && current.monitors[id].state === 'warming');
        return evaluateWorkspace(owner, { ...current, clock, lastTick: now, monitors, lastNotice: finishedWarmup ? undefined : current.lastNotice, lastFeed: current.feed === 'healthy' ? clock : current.lastFeed });
      });
    },
    advanceCandle: (owner, id) => {
      const workspace = get().workspaces[owner];
      const monitor = workspace?.monitors[id];
      if (!workspace || !monitor || monitor.state !== 'monitoring') return false;
      const times = [nextCandle(workspace.clock, monitor.definition.entry.cadence), ...watchedPositions(monitor, source(owner).sessions).map(position => nextCandle(workspace.clock, position.exit.cadence))].filter((time): time is number => time !== undefined);
      if (!times.length) return false;
      const clock = Math.min(...times) + 250;
      update(owner, current => evaluateWorkspace(owner, { ...current, clock, lastTick: Date.now(), lastFeed: current.feed === 'healthy' ? clock : current.lastFeed })); return true;
    },
    checkLatest: (owner, id) => {
      const workspace = get().workspaces[owner];
      const context = source(owner);
      const definition = context.definitions.find(item => item.id === id);
      if (!workspace || !definition || workspace.feed !== 'healthy' || workspace.monitors[id]?.state === 'warming') return false;
      if (!context.cache?.candidates.length && !watchedPositions(workspace.monitors[id] ?? idleMonitor(definition), context.sessions).length) return false;
      update(owner, current => {
        const before = new Set(current.signals.map(signal => signal.id));
        const result = evaluateWorkspace(owner, { ...current, monitors: { ...current.monitors, [id]: current.monitors[id] ?? idleMonitor(structuredClone(definition)) }, lastFeed: current.clock }, id);
        return { ...result, lastNotice: result.signals.some(signal => !before.has(signal.id)) ? 'Latest completed candles checked. Results are alerts only.' : 'Latest completed candles checked. No new matching events; repeated candles are not emitted again.' };
      }); return true;
    },
    setFeed: (owner, feed) => update(owner, workspace => {
      const recovering = feed === 'healthy' && workspace.feed !== 'healthy';
      const monitors = Object.fromEntries(Object.entries(workspace.monitors).map(([id, monitor]) => [id, recovering && monitor.state !== 'stopped' ? { ...monitor, state: 'warming' as const, readyAt: Date.now() + 2500, lastEntryBar: closedCandle(workspace.clock, monitor.definition.entry.cadence), lastExitBars: Object.fromEntries(watchedPositions(monitor, source(owner).sessions).map(position => [position.id, closedCandle(workspace.clock, position.exit.cadence) ?? 0])) } : monitor]));
      return evaluateWorkspace(owner, { ...workspace, feed, monitors, lastTick: Date.now(), lastNotice: recovering ? 'Reloading sample history. Missed candles will not produce fresh entry alerts.' : undefined });
    }),
    toggleSamples: (owner, id) => update(owner, workspace => {
      const context = source(owner); const definition = context.definitions.find(item => item.id === id);
      if (!definition || !context.cache) return workspace;
      const monitor = workspace.monitors[id] ?? idleMonitor(structuredClone(definition));
      return evaluateWorkspace(owner, { ...workspace, monitors: { ...workspace.monitors, [id]: { ...monitor, samplePositions: monitor.samplePositions.length ? [] : samplePositions(definition, context.cache), lastProtection: {} } } });
    }),
    interrupt: owner => update(owner, workspace => ({ ...workspace, interrupted: Object.values(workspace.monitors).some(monitor => monitor.state !== 'stopped') || workspace.interrupted, monitors: Object.fromEntries(Object.entries(workspace.monitors).map(([id, monitor]) => [id, { ...monitor, state: 'stopped' as const }])) })),
  };
}, { name: 'quantforge-signal-monitor', version: 1, merge: (persisted, current) => {
  const saved = (persisted as Partial<MonitorState> | undefined)?.workspaces ?? {};
  return { ...current, workspaces: Object.fromEntries(Object.entries(saved).map(([owner, workspace]) => [owner, { ...workspace, lastTick: Date.now(), interrupted: Object.values(workspace.monitors).some(monitor => monitor.state !== 'stopped') || workspace.interrupted, monitors: Object.fromEntries(Object.entries(workspace.monitors).map(([id, monitor]) => [id, { ...monitor, state: 'stopped', lastProtection: monitor.lastProtection ?? {} }])), signals: workspace.signals.map(signal => signal.disposition === 'ready' ? { ...signal, disposition: 'expired', explanation: 'Previous browser session ended. Restart monitoring for fresh alerts.' } : signal) }])) };
} }));
