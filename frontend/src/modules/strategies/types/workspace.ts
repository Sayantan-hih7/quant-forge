export type TradingHorizon = 'intraday' | 'short-term' | 'long-term';
export type EvaluationTimeframe = '1m' | '5m' | '15m' | '1h' | '1d' | '1w' | '1mo';
export type QualificationCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface QualificationRules {
  source: 'NSE 500' | 'NSE 200';
  trend: 'above-ema50' | 'above-ema200' | 'any';
  minMomentum: number;
  minTurnover: number;
}
export interface QualifiedStock {
  symbol: string;
  name: string;
  sector: string;
  close: number;
  ema50: number;
  ema200: number;
  momentum: number;
  turnover: number;
}
export interface UniverseSnapshot {
  id: string;
  month: string;
  version: number;
  qualifiedAt: string;
  rules: QualificationRules;
  stocks: QualifiedStock[];
}
export interface TradingLayer {
  id: string;
  name: string;
  templateId: string;
  horizon: TradingHorizon;
  timeframe: EvaluationTimeframe;
  qualificationRule: string;
  qualificationCadence: QualificationCadence;
  entryRule: string;
  exitRule: string;
  mode: 'PAPER' | 'LIVE';
  status: 'active' | 'paused';
  watchlist: null | {
    id: string;
    snapshotId: string;
    qualifiedAt: string;
    symbols: string[];
  };
  evaluation: null | {
    snapshotId: string;
    watchlistId: string;
    evaluatedAt: string;
    matchedSymbols: string[];
  };
}
export type TradingLayerConfig = Omit<TradingLayer, 'id' | 'status' | 'evaluation' | 'watchlist'>;
export interface MonthlyBase {
  id: string;
  name: string;
  current: UniverseSnapshot;
  history: UniverseSnapshot[];
  plannedRules: QualificationRules | null;
  layers: TradingLayer[];
}
export interface StrategyWorkspace {
  selectedBaseId: string;
  bases: MonthlyBase[];
}
