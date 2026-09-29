import type { BackendBacktest } from '../../src/modules/backtesting/types/backend';
import { sampleTradingPlan } from '../../src/modules/strategies/utils/tradingPlans';

const base = sampleTradingPlan('swing');
export const reportStrategy = { ...base, name: 'Weekly trend · daily entry', _id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: 3, savedAt: '2026-09-28T04:30:12.000Z' };
reportStrategy.entry.groups = [{ logic: 'AND', conditions: [{ ...base.entry.groups[0].conditions[0], left: 'bodyAboveEma', leftPeriod: 5, leftFrame: '1d', operator: 'gte', rightType: 'value', value: 80 }] }];
export function reportFixture(): BackendBacktest {
  return {
    _id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', strategy: structuredClone(reportStrategy), status: 'completed', createdAt: '2026-09-28T04:30:12.000Z',
    symbols: { 'NSE:1': 'ALPHA', 'NSE:2': 'BETA', 'BSE:3': 'GAMMA', 'NSE:4': 'DELTA', 'NSE:5': 'NOTRADE' },
    config: { from: '2026-09-01T00:00:00+05:30', to: '2026-09-28T00:00:00+05:30', ids: ['NSE:1', 'NSE:2', 'BSE:3', 'NSE:4', 'NSE:5'], universe: 'historical', includeManual: true },
    result: {
      initialCapital: 100000, equity: 100096.4, netPnl: 96.4, returnPercent: 0.0964, maxDrawdownPercent: 1, unavailableDecisions: 0,
      closedTrades: 4, winRate: 25, profitFactor: 2, totalFees: 7, realizedPnl: 106,
      openPositions: [
        { instrumentId: 'NSE:1', entryAt: '2026-09-21T03:45:00Z', quantity: 6, initialQuantity: 10, entry: 10000, mark: 107, cost: 60060, stop: 100, target: 116 },
        { instrumentId: 'NSE:2', entryAt: '2026-09-21T03:45:00Z', quantity: 5, initialQuantity: 5, entry: 20000, mark: 190, cost: 100100, stop: 180, target: 220 },
      ],
      trades: [
        { instrumentId: 'NSE:1', entryAt: '2026-09-01T03:45:00Z', exitAt: '2026-09-02T03:45:00Z', quantity: 4, remainingQuantity: 6, entry: 100, exit: 108, pnl: 31, reason: 'Target 1' },
        { instrumentId: 'NSE:1', entryAt: '2026-09-01T03:45:00Z', exitAt: '2026-09-03T03:45:00Z', quantity: 6, remainingQuantity: 0, entry: 100, exit: 116, pnl: 95, reason: 'Target 2' },
        { instrumentId: 'NSE:1', entryAt: '2026-09-10T03:45:00Z', exitAt: '2026-09-11T03:45:00Z', quantity: 10, remainingQuantity: 0, entry: 100, exit: 97, pnl: -31, reason: 'Stop loss' },
        { instrumentId: 'NSE:1', entryAt: '2026-09-21T03:45:00Z', exitAt: '2026-09-22T03:45:00Z', quantity: 4, remainingQuantity: 6, entry: 100, exit: 108, pnl: 31, reason: 'Target 1' },
        { instrumentId: 'BSE:3', entryAt: '2026-09-01T03:45:00Z', exitAt: '2026-09-02T03:45:00Z', quantity: 1, remainingQuantity: 0, entry: 100, exit: 100, pnl: 0, reason: 'Sell rule' },
        { instrumentId: 'NSE:4', entryAt: '2026-09-01T03:45:00Z', exitAt: '2026-09-02T03:45:00Z', quantity: 4, remainingQuantity: 6, entry: 100, exit: 105, pnl: 20, reason: 'Target 1' },
        { instrumentId: 'NSE:4', entryAt: '2026-09-01T03:45:00Z', exitAt: '2026-09-03T03:45:00Z', quantity: 6, remainingQuantity: 0, entry: 100, exit: 93.34, pnl: -40, reason: 'Stop loss' },
      ],
      coverage: ['NSE:1', 'NSE:2', 'BSE:3', 'NSE:4', 'NSE:5'].map(instrumentId => ({ instrumentId, bars: 20, from: '2026-09-01T03:45:00Z', to: '2026-09-25T10:00:00Z' })),
      curve: [{ at: '2026-09-01T10:00:00Z', equity: 100000 }, { at: '2026-09-25T10:00:00Z', equity: 100096.4 }], assumptions: ['Historical candles; simulated executions.'],
    },
  };
}
