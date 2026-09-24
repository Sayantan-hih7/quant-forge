import type { CandidateStock, RuleTemplate } from '../../qualification/types';
import type { StrategyRisk } from '../../strategies/schemas/tradingPlanSchema';

export interface MonitorDefinition { id: string; name: string; entry: RuleTemplate; exit?: RuleTemplate; risk?: StrategyRisk }
export interface WatchedPosition {
  id: string; symbol: string; quantity: number; price: number; stop: number; target: number;
  source: 'Paper' | 'Sample'; sessionId?: string; exit: RuleTemplate; overnight: boolean; entryPaused: boolean;
  stock: CandidateStock;
}
export interface StrategyMonitor {
  definition: MonitorDefinition; state: 'stopped' | 'warming' | 'monitoring'; readyAt: number;
  entryPaused: boolean; lastEntryBar?: number; lastExitBars: Record<string, number>;
  lastProtection: Record<string, string>;
  lastEvaluation?: number; lastCandle?: number; checkedCount: number; samplePositions: WatchedPosition[];
}
export type SignalDisposition = 'ready' | 'blocked' | 'expired';
export interface MonitorSignal {
  id: string; monitorId: string; strategy: string; symbol: string; side: 'BUY' | 'SELL';
  time: number; candle?: number; expiresAt: number; price: number;
  disposition: SignalDisposition; explanation: string; trigger: 'Entry rule' | 'Sell rule' | 'Stop loss' | 'Profit target' | 'Session exit';
  source: 'Monitoring' | 'Manual check'; rule: RuleTemplate; positionId?: string;
  custom: boolean; outsideUniverse: boolean;
}
export interface MonitorWorkspace {
  selectedId?: string; clock: number; lastTick: number; feed: 'healthy' | 'delayed' | 'disconnected';
  lastFeed?: number; monitors: Record<string, StrategyMonitor>; signals: MonitorSignal[];
  interrupted: boolean; lastNotice?: string;
}
