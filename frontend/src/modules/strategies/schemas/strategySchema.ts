import { z } from "zod";
export const segments = [
  "NSE EQ",
  "NIFTY OPT",
  "BANKNIFTY OPT",
  "NIFTY 500",
] as const;
export const strategySchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters")
    .max(60, "Use no more than 60 characters"),
  segment: z.enum(segments, { message: "Choose a supported market segment" }),
  mode: z.enum(["LIVE", "PAPER"]),
  timeframe: z.enum(["1m", "3m", "5m", "15m", "Daily"]),
  capital: z
    .number({
      required_error: "Enter an allocation amount",
      invalid_type_error: "Enter an allocation amount",
    })
    .min(10000, "Minimum allocation is ₹10,000")
    .max(100000000, "Maximum demo allocation is ₹10 Cr"),
});
export type StrategyFormValues = z.infer<typeof strategySchema>;
