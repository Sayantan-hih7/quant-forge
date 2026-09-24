import type { StockIndex } from '../config/stockIndices';
import type { MonthlyRuleTemplate } from './monthly';
import type { TradingPlan } from '../../strategies/types/tradingPlan';

export type Tier = 'base' | 'tactical';
export type Horizon = 'intraday' | 'swing' | 'long-term';
export type Timeframe = 'latest' | '1m' | '5m' | '15m' | '4h' | '1d' | '1w' | '1mo' | '1q';
export type Metric = 'marketCap' | 'turnover' | 'debtEquity' | 'pledge' | 'close' | 'volume' | 'avgVolume20' | 'ema5' | 'ema20' | 'sma200' | 'vwap' | 'rvol' | 'rsi' | 'growth' | 'roe';
export type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'crossAbove' | 'crossBelow' | 'within';
export interface Condition {
  left: Metric; leftFrame: Timeframe; operator: Operator;
  rightType: 'value' | 'indicator'; value: number;
  right: Metric; rightFrame: Timeframe; multiplier: number; tolerance: number;
}
export interface ConditionGroup { logic: 'AND' | 'OR'; conditions: Condition[] }
export interface RuleDefinition {
  name: string; description: string; tier: Tier; horizon: Horizon;
  logic: 'AND' | 'OR'; groups: ConditionGroup[];
  side: 'BUY' | 'SELL'; cadence: '1m' | '5m' | '15m' | 'daily';
}
export interface RuleTemplate extends RuleDefinition { id: string; revision: number }
export interface CandidateStock {
  index: number; symbol: string; name: string; sector: string;
  indices: StockIndex[];
  qualificationSource?: 'manual';
  manualAddedAt?: string;
  manualSelectionNote?: string;
  close: number; marketCap: number; turnover: number; debtEquity: number;
  pledge: number; avgVolume20: number; growth: number; roe: number;
}
export interface MonthlyCache {
  id: string; month: string; createdAt: string; sourceCount: number;
  rule: RuleTemplate | MonthlyRuleTemplate; candidates: CandidateStock[]; dataMonth?: string;
}
export interface TacticalSignal {
  symbol: string; name: string; sector: string; side: 'BUY' | 'SELL';
  price: number; entry: number; stopLoss: number; target: number;
  reason: string; index: number;
}
export interface SignalRun {
  id: string; cacheId: string; month: string; templateId: string; revision: number;
  strategy: string; horizon: Horizon; cadence: RuleDefinition['cadence'];
  scannedCount: number; time: string; signals: TacticalSignal[];
}
export interface QualificationWorkspace {
  tradingPlans?: TradingPlan[];
  monthlyRule: MonthlyRuleTemplate; monthlyRuleSaved: boolean; cacheHistory: MonthlyCache[];
  templates: RuleTemplate[]; activeBaseId: string; selectedTacticalId: string;
  caches: Record<string, MonthlyCache>; runs: SignalRun[]; scheduledPreview: boolean;
  jobs: ScanJob[];
}
export type ScanStatus = 'queued' | 'running' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
export interface ScanJob {
  id: string; kind: 'monthly' | 'trial' | 'tactical'; status: ScanStatus;
  phase: 'queued' | 'loading' | 'evaluating' | 'finalizing' | 'done';
  month: string; cacheId?: string; rules: (RuleTemplate | MonthlyRuleTemplate)[]; scopeCount: number; dataMonth?: string;
  createdAt: number; updatedAt: number; progress: number; processed: number;
  result?: MonthlyCache; signalCount?: number; error?: string;
}
