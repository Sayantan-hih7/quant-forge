import { expect, test } from '@playwright/test';

test('paper confirmations reject duplicates, expired alerts and other owners while retaining exits outside the monthly list', async () => {
  const storage = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } } });
  try {
    const { useQualificationStore } = await import('../src/modules/qualification/store/qualificationStore');
    const { useSignalMonitorStore } = await import('../src/modules/signals/store/signalMonitorStore');
    const { usePaperTradingStore, paperQuote } = await import('../src/modules/paper-trading/store/paperTradingStore');
    const { confirmPaperSignal } = await import('../src/modules/paper-trading/utils/paperSignals');
    const { monitorDefinitions } = await import('../src/modules/signals/utils/monitoring');
    const { defaultBacktestConfig } = await import('../src/modules/backtesting/schemas/backtestSchema');
    const { createBacktestScope, simulateBacktest } = await import('../src/modules/backtesting/api/mockBacktest');
    const { monthKey } = await import('../src/modules/strategies/utils/monthlyCycle');
    const owner = 'paper-integration';
    useQualificationStore.getState().initialize(owner, Date.now());
    const qualification = useQualificationStore.getState().workspaces[owner];
    const definition = monitorDefinitions(qualification)[0];
    const config = { ...defaultBacktestConfig(definition.entry.id, definition.exit!.id), ...definition.risk };
    const scope = createBacktestScope({ ...config, universe: 'current' }, qualification.caches[monthKey(Date.now())]);
    const report = { id: 'test-report', createdAt: Date.now(), status: 'completed' as const, config, entryRule: definition.entry, exitRule: definition.exit!, scope };
    const sessionId = usePaperTradingStore.getState().start(owner, { ...report, result: simulateBacktest(report) }, scope)!;
    const session = () => usePaperTradingStore.getState().sessions[owner][0];
    const monitor = () => useSignalMonitorStore.getState().workspaces[owner];
    useSignalMonitorStore.getState().initialize(owner);
    useSignalMonitorStore.getState().checkLatest(owner, definition.id);
    const buy = monitor().signals.find(event => event.side === 'BUY' && event.disposition === 'ready')!;
    expect(buy).toBeTruthy();
    expect(confirmPaperSignal('another-owner', sessionId, buy.id, 1)).toContain('no longer available');
    expect(confirmPaperSignal(owner, sessionId, buy.id, 1)).toBeNull();
    expect(session().positions).toHaveLength(1);
    expect(confirmPaperSignal(owner, sessionId, buy.id, 1)).toContain('Already handled');
    expect(session().events).toHaveLength(1);
    const other = monitor().signals.find(event => event.side === 'BUY' && event.symbol !== buy.symbol)!;
    const savedClock = monitor().clock;
    useSignalMonitorStore.setState(state => ({ workspaces: { ...state.workspaces, [owner]: { ...monitor(), clock: other.expiresAt + 1 } } }));
    expect(confirmPaperSignal(owner, sessionId, other.id, 1)).toContain('fresh alert');
    expect(session().events).toHaveLength(1);
    useSignalMonitorStore.setState(state => ({ workspaces: { ...state.workspaces, [owner]: { ...monitor(), clock: savedClock } } }));
    useQualificationStore.setState(state => ({ workspaces: { ...state.workspaces, [owner]: { ...qualification, caches: { ...qualification.caches, [monthKey(Date.now())]: { ...qualification.caches[monthKey(Date.now())], candidates: [] } } } } }));
    expect(usePaperTradingStore.getState().buyManual(owner, sessionId, other.symbol, 1, '')).toContain('outside the current qualified list');
    usePaperTradingStore.setState(state => ({ sessions: { ...state.sessions, [owner]: [{ ...session(), paused: true, positions: session().positions.map(position => ({ ...position, stop: paperQuote(session(), position.symbol) + 1 })) }] } }));
    useSignalMonitorStore.getState().checkLatest(owner, definition.id);
    const exit = monitor().signals.find(event => event.side === 'SELL' && event.disposition === 'ready')!;
    expect(exit).toMatchObject({ outsideUniverse: true, trigger: 'Stop loss' });
    expect(confirmPaperSignal(owner, sessionId, exit.id, 1)).toBeNull();
    expect(session().positions).toHaveLength(0);
    expect(session().events).toHaveLength(2);
    expect(session().events.every(event => event.source === 'Signal' && event.signalId)).toBe(true);
    expect(session().cash).toBeCloseTo(session().config.initialCapital + session().realized, 6);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
