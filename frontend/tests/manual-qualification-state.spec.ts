import { expect, test } from '@playwright/test';
import { monthKey, previousMonth } from '../src/modules/strategies/utils/monthlyCycle';

test('store protects scan stocks, rejects bulk removal during a scan, and removes manual stocks atomically', async () => {
  const storage = new Map<string, string>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } } });
  try {
    const { useQualificationStore } = await import('../src/modules/qualification/store/qualificationStore');
    const owner = 'manual-stock-test';
    const month = monthKey(Date.now());
    const actions = useQualificationStore.getState();
    const workspace = () => useQualificationStore.getState().workspaces[owner];
    actions.initialize(owner, Date.now());
    const scanned = workspace().caches[month];
    expect(actions.removeQualifiedStock(owner, month, 'RELIANCE')).toBe(false);
    expect(workspace().caches[month]).toEqual(scanned);
    expect(actions.addQualifiedStocks(owner, month, ['MOTHERSON', 'DEMO6200'])).toBe(2);
    const before = workspace().caches[month];
    const changed = structuredClone(workspace().monthlyRule);
    changed.groups[0].conditions[2].value = 0.4;
    expect(actions.saveMonthlyRule(owner, changed)).toBe(true);
    const job = actions.queueBaseScan(owner)!;
    expect(job).toBeTruthy();
    expect(actions.removeAllManualStocks(owner, month)).toBe(0);
    expect(workspace().caches[month]).toEqual(before);
    actions.advanceScans(owner, Date.now() + 31000);
    expect(workspace().jobs[0].status).toBe('ready');
    expect(actions.removeAllManualStocks(owner, month)).toBe(0);
    actions.cancelScan(owner, job);
    expect(actions.removeAllManualStocks(owner, previousMonth(month))).toBe(0);
    expect(actions.removeAllManualStocks(owner, month)).toBe(2);
    expect(workspace().caches[month].candidates).toEqual(scanned.candidates);
    expect(workspace().caches[month].id).not.toBe(before.id);
    expect(workspace().cacheHistory[0]).toEqual(before);
    const after = workspace().caches[month];
    expect(actions.removeAllManualStocks(owner, month)).toBe(0);
    expect(workspace().caches[month]).toEqual(after);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
