import { defaultCondition } from "../../qualification/config/metrics";
import type { RuleTemplate } from "../../qualification/types";

export const defaultExitRule: RuleTemplate = {
  id: "demo-momentum-exit",
  revision: 1,
  name: "Momentum exit",
  description:
    "Exit a held long position when price drops below EMA 20 or RSI weakens.",
  tier: "tactical",
  horizon: "intraday",
  side: "SELL",
  cadence: "15m",
  logic: "OR",
  groups: [
    {
      logic: "OR",
      conditions: [
        {
          ...defaultCondition,
          left: "close",
          leftFrame: "15m",
          operator: "lt",
          rightType: "indicator",
          right: "ema20",
          rightFrame: "15m",
        },
        {
          ...defaultCondition,
          left: "rsi",
          leftFrame: "15m",
          operator: "lt",
          rightType: "value",
          value: 45,
        },
      ],
    },
  ],
};
export const BACKTEST_DURATION = 30000;
export const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
export const signedMoney = (value: number) =>
  `${value > 0 ? "+" : ""}${money(value)}`;
export const tradeTime = (value: number) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
