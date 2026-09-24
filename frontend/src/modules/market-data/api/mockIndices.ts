import { indexCatalog } from "../config/indices";
import type { IndexQuote } from "../types/indices";

export const indexSnapshot = {
  time: "18 Sep 2026 · 10:33 IST",
  iso: "2026-09-18T10:33:00+05:30",
  start: "09:15",
  end: "10:33",
};
const round = (value: number) => Math.round(value * 100) / 100;
const featured: Record<string, [number, number]> = {
  "NIFTY 50": [24685.4, 152.3],
  "NIFTY BANK": [52340.15, 410.8],
  "NIFTY MIDCAP 100": [58120.45, 690.1],
  "NIFTY IT": [38740.2, -326.15],
  "NIFTY NEXT 50": [70240.65, -225.4],
  "NIFTY FINANCIAL SERVICES": [23890.6, -84.2],
  "NIFTY MIDCAP SELECT": [12765.85, 145.7],
  "NIFTY INDIA FPI 150": [18240.5, 0],
  "INDIA VIX": [12.85, -0.42],
  "BSE SENSEX": [80684.35, 482.9],
  "BSE BANKEX": [60418.75, -216.4],
  "BSE MIDCAP": [45162.8, 385.25],
  "BSE INFORMATION TECHNOLOGY": [36782.6, -301.85],
  "BSE SENSEX 50": [25681.45, 0],
  "BSE FOCUSED IT": [34862.5, -279.4],
};
// Every price, range and chart point is synthetic. No market request is made.
export const mockIndexQuotes: IndexQuote[] = indexCatalog.map((index, i) => {
  const last =
    featured[index.name]?.[0] ?? round(8400 + i * 1137.35 + (i % 3) * 432.7);
  const change =
    featured[index.name]?.[1] ??
    round(last * [0.0072, -0.0043, 0.0135, -0.0082, 0.0031, 0, 0.0187][i % 7]);
  const previousClose = round(last - change);
  const open = round(previousClose * (1 + ((i % 5) - 2) * 0.0006));
  const series = Array.from({ length: 28 }, (_, n) => {
    const progress = n / 27;
    return round(
      open +
        (last - open) * progress +
        Math.sin(progress * Math.PI) * Math.sin(n * 1.7 + i) * last * 0.0008,
    );
  });
  series[0] = open;
  series[series.length - 1] = last;
  return {
    ...index,
    last,
    previousClose,
    change,
    percent: round((change / previousClose) * 100),
    open,
    high: round(Math.max(...series) * 1.0008),
    low: round(Math.min(...series) * 0.9992),
    high52w: round(last * (1.09 + (i % 5) * 0.03)),
    low52w: round(last * (0.69 + (i % 4) * 0.04)),
    series,
  };
});
