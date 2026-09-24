import type { RuleTemplate } from "../../qualification/types";
import type { BacktestConfig } from "../schemas/backtestSchema";
export type { BacktestConfig } from "../schemas/backtestSchema";

export interface BacktestScope {
  mode: BacktestConfig["universe"];
  label: string;
  symbols: { symbol: string; price: number; manual: boolean }[];
  manualCount: number;
}
export interface BacktestTrade {
  id: string;
  symbol: string;
  quantity: number;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  fees: number;
  pnl: number;
  reason: string;
}
export interface EquityPoint {
  time: number;
  equity: number;
  drawdown: number;
}
export interface BacktestResult {
  trades: BacktestTrade[];
  curve: EquityPoint[];
  netPnl: number;
  fees: number;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number | null;
  endingCapital: number;
}
export interface BacktestRun {
  id: string;
  createdAt: number;
  finishedAt?: number;
  status: "running" | "completed" | "cancelled" | "failed";
  config: BacktestConfig;
  entryRule: RuleTemplate;
  exitRule: RuleTemplate;
  scope: BacktestScope;
  result?: BacktestResult;
  error?: string;
}
