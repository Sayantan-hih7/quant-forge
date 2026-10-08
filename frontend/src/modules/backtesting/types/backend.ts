import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
export interface BackendBacktest { paperEligibilitySettings?:import('../components/BacktestPaperEligibility').EligibilitySettings;
  selectionAudit?: {policy:'ready'|'all';requestedIds:string[];includedIds:string[];excluded:{instrumentId:string;reasons:string[]}[];method:string};
  _id: string; status: string; stage?: string; createdAt: string; strategy: SavedStrategy; message?: string; symbols?: Record<string, string>;
  config: { from: string; to: string; universe: 'historical' | 'current'; ids: string[]; includeManual: boolean; dataPolicy?: 'ready'|'all' };
  progress?: { processed: number; total: number; downloaded: number; reused: number; symbol: string };
  reportPreparation?: { total: number; ready: number; unavailable: { exchange: string; date: string; message: string }[] };
  historyReview?: { checkedSessions:number; recoveredCandles:number; providerMissingSessions:number; failedChecks:number; deferredSessions:number; reusedChecks:number };
  result?: {
    metrics?:{cagrPercent:number|null;sharpe:number|null;sortino:number|null;expectancy:number|null;dailyObservations:number;method:string;monthlyReturns:{month:string;openingEquity:number;closingEquity:number;returnPercent:number|null}[]};
    warmupDecisions?:number; unreadyInstruments?:string[]; warmup?:{instrumentId:string;skippedDecisions:number;firstReadyAt:string|null}[];
    zeroVolumeBars?:number; expiredSignalOrders?:number;
    engineVersion?: string; inputCandles?: number;
    historyQuality?: { leadingMissingMinutes?:number; internalMissingMinutes?:number; trailingMissingMinutes?:number; noCandleSessions?:number; zeroVolumeMinutes?:number; sessionsChecked: number; incompleteSessions: number; missingMinutes: number; missingExitSessions: number; affected: { instrumentId: string; incompleteSessions: number; missingMinutes: number; missingExitSessions: number }[] };
    unavailableInputs?: { field: string; reason: string; checks: number }[];
    initialCapital: number; equity: number; netPnl: number; maxDrawdownPercent: number; unavailableDecisions: number;
    entrySafeguards?: {blocked:Record<string,number>;dailyLossDates:string[]}; closedTrades?: number; invalidTargetEntries?: number; invalidStopEntries?: number; stopLimitEntries?: number; unfilledLimitEntries?: number; returnPercent: number; winRate: number | null; profitFactor: number | null; totalFees: number; realizedPnl: number;
    openPositions: { instrumentId: string; entryAt?: string; quantity: number; initialQuantity?: number; initialRiskPaise?: number; trailingActivated?: boolean; breakevenActivated?: boolean; entry: number; mark: number; cost: number; stop: number; target: number }[];
    curve: { at: string; equity: number }[];
    trades: { instrumentId: string; entryAt: string; exitAt: string; quantity: number; remainingQuantity?: number; entry: number; exit: number; pnl: number; reason: string }[];
    coverage: { instrumentId: string; bars: number; from: string; to: string }[]; assumptions: string[];
  };
}
