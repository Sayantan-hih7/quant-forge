import type { SavedStrategy } from '../hooks/useBackendStrategies';
export interface RevisionUse { id:string;kind:'backtest'|'signals'|'paper';at?:string;status:string }
export interface RevisionSnapshot { strategy:SavedStrategy;source:'saved'|'backtest'|'session';uses:RevisionUse[];inconsistent:boolean }
export interface StrategyHistory { strategyId:string;currentRevision:number|null;revisions:RevisionSnapshot[];missingRanges:string[] }
