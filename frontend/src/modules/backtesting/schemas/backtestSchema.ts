import { z } from "zod";

export const todayIST = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Choose a valid date.",
  );
export const backtestSchema = z
  .object({
    entryRuleId: z.string().min(1, "Select a buy entry rule."),
    exitRuleId: z.string().min(1, "Select a sell exit rule."),
    startDate: date,
    endDate: date,
    universe: z.enum(["historical", "current"]),
    includeManual: z.boolean(),
    initialCapital: z.number().min(1000, "Use at least ₹1,000.").max(100000000),
    riskPercent: z.number().min(0.1).max(5),
    maxPositions: z.number().int().min(1).max(20),
    timeframe: z.enum(["1m", "5m", "15m", "1h", "1d"]),
    stopMode: z.enum(["ATR", "fixed", "trailing"]),
    stopPercent: z.number().min(0.1).max(25),
    atrPeriod: z.number().int().min(2).max(100),
    atrMultiplier: z.number().min(0.5).max(10),
    targetR: z.number().min(0.5).max(10),
    overnight: z.boolean(),
    slippagePercent: z.number().min(0).max(2),
    feePercent: z.number().min(0).max(2),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must follow the start date.",
      });
    if (value.endDate >= todayIST())
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Use a completed day before today.",
      });
    if (
      (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 >
      730
    )
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Limit this UI preview to two years.",
      });
    if (value.timeframe === "1d" && !value.overnight)
      ctx.addIssue({
        code: "custom",
        path: ["overnight"],
        message:
          "Daily candles require overnight holding. Use an intraday interval for same-day exits.",
      });
  });
export type BacktestConfig = z.infer<typeof backtestSchema>;
export function defaultBacktestConfig(
  entryRuleId: string,
  exitRuleId: string,
): BacktestConfig {
  const end = new Date(`${todayIST()}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return {
    entryRuleId,
    exitRuleId,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    universe: "historical",
    includeManual: false,
    initialCapital: 100000,
    riskPercent: 1,
    maxPositions: 4,
    timeframe: "15m",
    stopMode: "ATR",
    stopPercent: 2,
    atrPeriod: 14,
    atrMultiplier: 2,
    targetR: 2,
    overnight: false,
    slippagePercent: 0.02,
    feePercent: 0.03,
  };
}
