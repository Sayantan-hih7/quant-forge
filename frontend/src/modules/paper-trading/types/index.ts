import type { BacktestConfig, BacktestScope } from '../../backtesting/types';
import type { RuleTemplate } from '../../qualification/types';
export interface PaperPosition { id: string; symbol: string; quantity: number; entry: number; entryFee: number; stop: number; target: number; source: 'Algo' | 'Manual' | 'Signal'; openedAt: number }
export interface PaperEvent { id: string; symbol: string; side: 'BUY' | 'SELL'; quantity: number; price: number; fees: number; pnl?: number; source: 'Algo' | 'Manual' | 'Signal'; reason: string; time: number; signalId?: string }
export interface PaperSession {
  id: string; runId: string; name: string; createdAt: number; config: BacktestConfig; entryRule: RuleTemplate; exitRule: RuleTemplate; scope: BacktestScope;
  cash: number; realized: number; paused: boolean; tick: number; positions: PaperPosition[]; events: PaperEvent[];
}
