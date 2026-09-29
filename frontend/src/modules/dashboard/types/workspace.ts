import type { MarketSession } from '../../market-data/types/session';
import type { DashboardPreferences } from '../config/preferences';
export interface WorkspaceDashboard {
  preferences?: DashboardPreferences;
  at: string; month: string; market: MarketSession; stockCount: number; strategyCount: number; signalsToday: number;
  qualification: { count: number; manualCount: number; publishedAt: string | null; latestScan: null | { _id: string; status: string; processed: number; total: number; qualified: number; unavailable: number; message?: string } };
  paper: { accounts: number; openPositions: number; realizedPaise: number; unrealizedPaise: number | null; totalPaise: number | null; missingMarks: number; staleMarks: number;
    pendingOrders: number; confirmations: number; workerRunning: boolean; feed: string; feedMessage?: string;
    sessions: { id: string; name: string; revision: number; currentRevision: number | null; mode: string; paused: boolean; stocks: number; checkedAt: string | null; message: string | null }[] };
  signals: { id: string; sessionId: string; symbol: string; side: string; at: string; strategy: string; status: string }[];
  backtests: { id: string; strategyId: string; name: string; revision: number; currentRevision: number | null; status: string; from: string; to: string }[];
  watchlists: { id: string; name: string; count: number }[];
}
