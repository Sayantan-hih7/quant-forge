export type StrategyMode = "LIVE" | "PAPER" | "HALTED";
export interface Strategy {
  id: string;
  name: string;
  description: string;
  mode: StrategyMode;
  segment: string;
  signals: number;
  clients: number;
  capital: number;
  pnl: number;
  roi: number;
  drawdown: number;
  health: number;
}
