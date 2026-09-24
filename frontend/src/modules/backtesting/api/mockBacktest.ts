import { mockMarket } from "../../qualification/api/mockMarket";
import type { MonthlyCache } from "../../qualification/types";
import type {
  BacktestConfig,
  BacktestResult,
  BacktestRun,
  BacktestScope,
  BacktestTrade,
} from "../types";

export function createBacktestScope(
  config: BacktestConfig,
  cache?: MonthlyCache,
): BacktestScope {
  // Historical membership is an illustrative fixture, never today's cache disguised as history.
  const stocks =
    config.universe === "historical"
      ? mockMarket.slice(0, 72)
      : (cache?.candidates ?? []).filter(
          (stock) =>
            config.includeManual || stock.qualificationSource !== "manual",
        );
  return {
    mode: config.universe,
    label:
      config.universe === "historical"
        ? "Demo monthly snapshots · sample membership"
        : `Fixed ${cache?.month ?? "missing"} list · exploratory only`,
    manualCount: stocks.filter(
      (stock) => stock.qualificationSource === "manual",
    ).length,
    symbols: stocks.map((stock) => ({
      symbol: stock.symbol,
      price: stock.close,
      manual: stock.qualificationSource === "manual",
    })),
  };
}
export const stopDistance = (price: number, config: Pick<BacktestConfig, "stopMode" | "atrMultiplier" | "stopPercent">) =>
  price *
  (config.stopMode === "ATR"
    ? 0.012 * config.atrMultiplier
    : config.stopPercent / 100);
export function positionSize(
  equity: number,
  cash: number,
  price: number,
  config: BacktestConfig,
) {
  if (!Number.isFinite(price) || price <= 0 || equity <= 0 || cash <= 0)
    return 0;
  const entry = price * (1 + config.slippagePercent / 100);
  const unitCost = entry * (1 + config.feePercent / 100);
  const stopProceeds =
    Math.max(0, entry - stopDistance(entry, config)) *
    (1 - config.slippagePercent / 100) *
    (1 - config.feePercent / 100);
  const unitRisk = unitCost - stopProceeds;
  return Math.max(
    0,
    Math.floor(
      Math.min(
        (equity * config.riskPercent) / 100 / unitRisk,
        equity / config.maxPositions / unitCost,
        cash / unitCost,
      ),
    ),
  );
}

/** UI fixtures only. This does not evaluate indicators or claim historical trading performance. */
export function simulateBacktest(run: BacktestRun): BacktestResult {
  const { config, scope } = run;
  const first = Date.parse(`${config.startDate}T09:15:00+05:30`);
  const last = Date.parse(`${config.endDate}T15:15:00+05:30`);
  const days: number[] = [];
  for (let time = first; time <= last; time += 86400000)
    if (![0, 6].includes(new Date(time).getUTCDay())) days.push(time);
  const interval =
    { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "1d": 1440 }[config.timeframe] *
    60000;
  const sampledDays = days.filter(
    (_, i) => i % Math.max(1, Math.ceil(days.length / 36)) === 0,
  );
  let equity = config.initialCapital;
  let peak = equity;
  const trades: BacktestTrade[] = [];
  const curve = [{ time: first, equity, drawdown: 0 }];
  sampledDays.forEach((time, i) => {
    const nextTradingDay = days.find((day) => day > time);
    if (config.timeframe === "1d" && !nextTradingDay) return;
    const stock = scope.symbols[i % scope.symbols.length];
    if (!stock) return;
    const price = Math.max(10, stock.price * (1 + Math.sin(i * 2.1) * 0.03));
    const quantity = positionSize(equity, equity, price, config);
    if (!quantity) return;
    const loss = i % 5 === 1 || i % 7 === 0;
    const sessionExit = !config.overnight && i % 4 === 0;
    const reason = loss
      ? config.stopMode === "trailing"
        ? "Trailing stop"
        : "Stop-loss"
      : sessionExit
        ? "Session square-off"
        : i % 3 === 0
          ? "Target reached"
          : "Sell condition";
    const multiple = loss
      ? -1
      : sessionExit
        ? 0.3
        : i % 3 === 0
          ? config.targetR
          : 0.65 + (i % 4) * 0.2;
    const entry = price * (1 + config.slippagePercent / 100);
    const exit =
      Math.max(1, price + stopDistance(price, config) * multiple) *
      (1 - config.slippagePercent / 100);
    const fees = ((entry + exit) * quantity * config.feePercent) / 100;
    const pnl = (exit - entry) * quantity - fees;
    const exitTime = Math.min(
      last,
      config.timeframe === "1d"
        ? nextTradingDay!
        : sessionExit
          ? time + 6 * 3600000
          : time + interval * 3,
    );
    trades.push({
      id: `${run.id}-${i}`,
      symbol: stock.symbol,
      quantity,
      entryTime: time,
      exitTime,
      entry,
      exit,
      fees,
      pnl,
      reason,
    });
    equity += pnl;
    peak = Math.max(peak, equity);
    curve.push({
      time: exitTime,
      equity,
      drawdown: ((equity - peak) / peak) * 100,
    });
  });
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  return {
    trades,
    curve,
    netPnl: equity - config.initialCapital,
    endingCapital: equity,
    fees: trades.reduce((sum, trade) => sum + trade.fees, 0),
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    maxDrawdown: Math.abs(Math.min(...curve.map((point) => point.drawdown))),
    profitFactor: losses.length
      ? wins.reduce((sum, trade) => sum + trade.pnl, 0) /
        -losses.reduce((sum, trade) => sum + trade.pnl, 0)
      : null,
  };
}
