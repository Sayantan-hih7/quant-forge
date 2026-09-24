import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
export interface BackendBacktest {
  _id: string; status: string; stage?: string; createdAt: string; strategy: SavedStrategy; message?: string; symbols?: Record<string, string>;
  config: { from: string; to: string; universe: 'historical' | 'current'; ids: string[]; includeManual: boolean };
  progress?: { processed: number; total: number; downloaded: number; reused: number; symbol: string };
  result?: {
    initialCapital: number; equity: number; netPnl: number; maxDrawdownPercent: number; unavailableDecisions: number;
    returnPercent: number; winRate: number | null; profitFactor: number | null; totalFees: number; realizedPnl: number;
    openPositions: { instrumentId: string; quantity: number; entry: number; mark: number; cost: number; stop: number; target: number }[];
    curve: { at: string; equity: number }[];
    trades: { instrumentId: string; entryAt: string; exitAt: string; quantity: number; entry: number; exit: number; pnl: number; reason: string }[];
    coverage: { instrumentId: string; bars: number; from: string; to: string }[]; assumptions: string[];
  };
}
