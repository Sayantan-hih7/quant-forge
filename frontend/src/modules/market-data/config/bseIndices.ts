import type { IndexDefinition } from "../types/indices";

// Index families from BSE Index Services' published equity index dashboard.
// Prices are supplied separately by exchange adapters, never copied from this category reference.
export const bseCategorySource =
  "https://www.bseindices.com/Downloads/Equity_Index_Dashboard_Jan_2026.pdf";
export const bseDerivativeSource =
  "https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20250623-59";
const focusedItSource =
  "https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20260415-34";

const broadNames = [
  "BSE SENSEX",
  "BSE SENSEX NEXT 30",
  "BSE SENSEX SIXTY",
  "BSE SENSEX 50",
  "BSE SENSEX 50 TMC",
  "BSE SENSEX NEXT 50",
  "BSE SENSEX NEXT 50 TMC",
  "BSE 100",
  "BSE 100 LARGECAP TMC",
  "BSE INDIA 150",
  "BSE 200",
  "BSE 500",
  "BSE LARGECAP",
  "BSE LARGEMIDCAP",
  "BSE 250 LARGEMIDCAP",
  "BSE 250 LARGEMIDCAP 65:35",
  "BSE MIDCAP",
  "BSE 150 MIDCAP",
  "BSE FOCUSED MIDCAP",
  "BSE MIDCAP SELECT",
  "BSE MIDSMALLCAP",
  "BSE 400 MIDSMALLCAP",
  "BSE SMALLCAP",
  "BSE 250 SMALLCAP",
  "BSE SMALLCAP SELECT",
  "BSE 1000",
  "BSE NEXT 500",
  "BSE 250 MICROCAP",
  "BSE NEXT 250 MICROCAP",
  "BSE ALLCAP",
];
const sectorNames = [
  "BSE AUTO",
  "BSE BANKEX",
  "BSE CAPITAL MARKETS",
  "BSE CAPITAL GOODS",
  "BSE COMMODITIES",
  "BSE CONSUMER DISCRETIONARY",
  "BSE CONSUMER DURABLES",
  "BSE ENERGY",
  "BSE FAST MOVING CONSUMER GOODS",
  "BSE FINANCIAL SERVICES",
  "BSE FOCUSED IT",
  "BSE HEALTHCARE",
  "BSE HOSPITALS",
  "BSE INDUSTRIALS",
  "BSE INSURANCE",
  "BSE INFORMATION TECHNOLOGY",
  "BSE METAL",
  "BSE MIDSMALL PRIVATE BANKS QUALITY TILT",
  "BSE OIL & GAS",
  "BSE POWER",
  "BSE PRIVATE BANKS",
  "BSE PSU BANK",
  "BSE REALTY",
  "BSE SERVICES",
  "BSE TELECOMMUNICATION",
  "BSE TOP 10 BANKS",
  "BSE UTILITIES",
];
// Only confirmed launched contracts are tagged. Approval alone does not imply availability.
const derivatives: Record<string, string> = {
  "BSE SENSEX": "SENSEX",
  "BSE BANKEX": "BANKEX",
  "BSE SENSEX 50": "SENSEX50",
  "BSE FOCUSED IT": "FOCIT",
};
export const bseIndexCatalog: IndexDefinition[] = [
  ...broadNames.map((name) => ({ name, family: "broad" as const })),
  ...sectorNames.map((name) => ({ name, family: "sectoral" as const })),
].map((index) => ({
  ...index,
  id: `bse:${index.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  exchange: "BSE",
  derivativeSymbol: derivatives[index.name],
  derivativeSource:
    index.name === "BSE FOCUSED IT" ? focusedItSource : undefined,
}));
