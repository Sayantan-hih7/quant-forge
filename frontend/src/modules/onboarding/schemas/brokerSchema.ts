import { z } from "zod";
export const credentialsSchema = z.object({
  clientId: z.string().trim().min(3, "Enter a broker client ID").max(40),
  apiKey: z
    .string()
    .trim()
    .min(6, "Enter an API key with at least 6 characters"),
  apiSecret: z
    .string()
    .trim()
    .min(8, "Enter an API secret with at least 8 characters"),
  totpSecret: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^[A-Z2-7]{16,64}$/i.test(value),
      "Use a 16–64 character Base32 secret (A–Z and 2–7)",
    ),
});
export type CredentialsValues = z.infer<typeof credentialsSchema>;
export const riskSchema = z
  .object({
    capital: z
      .number({ invalid_type_error: "Enter your capital allocation" })
      .min(10000, "Minimum demo allocation is ₹10,000")
      .max(100000000, "Maximum demo allocation is ₹10 Cr"),
    dailyLoss: z
      .number({ invalid_type_error: "Enter your daily stop loss" })
      .min(100, "Minimum daily stop loss is ₹100"),
    multiplier: z.number().min(0.5).max(2),
  })
  .refine((values) => values.dailyLoss < values.capital, {
    path: ["dailyLoss"],
    message: "Daily stop loss must be less than allocated capital",
  });
export type RiskValues = z.infer<typeof riskSchema>;
