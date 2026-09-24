import type {
  IndexCategory,
  IndexDefinition,
  IndexExchange,
} from "../types/indices";
import {
  bseCategorySource,
  bseDerivativeSource,
  bseIndexCatalog,
} from "./bseIndices";

// Names and classifications checked against NSE's reference pages on 18 September 2026.
// Eligibility is catalog metadata, not a live contract-availability feed.
const nseIndexCategories: {
  key: IndexCategory;
  label: string;
  description: string;
  source: string;
}[] = [
  {
    key: "derivatives",
    label: "Derivatives eligible",
    description: "Index underlyings eligible for NSE futures and options.",
    source:
      "https://www.nseindia.com/static/products-services/equity-derivatives-contract-specifications",
  },
  {
    key: "broad",
    label: "Broad market",
    description: "Benchmarks across market-cap segments and the wider market.",
    source: "https://www.nseindia.com/products-services/indices-broad-market",
  },
  {
    key: "sectoral",
    label: "Sectoral",
    description: "Track the relative direction of individual industry sectors.",
    source: "https://www.nseindia.com/products-services/indices-sectoral",
  },
];
export const getIndexCategories = (exchange: IndexExchange) =>
  exchange === "NSE"
    ? nseIndexCategories
    : nseIndexCategories.map((category) => ({
        ...category,
        description:
          category.key === "derivatives"
            ? "Index underlyings with BSE futures and options contracts."
            : category.description,
        source:
          category.key === "derivatives"
            ? bseDerivativeSource
            : bseCategorySource,
      }));

export const indexExchanges: Record<
  IndexExchange,
  {
    name: string;
    reference: string;
    benchmarks: string[];
    derivativeOrder: string[];
  }
> = {
  NSE: {
    name: "National Stock Exchange",
    reference: "https://www.nseindia.com/market-data/live-market-indices",
    benchmarks: ["NIFTY 50", "NIFTY BANK", "NIFTY MIDCAP 100", "NIFTY IT"],
    derivativeOrder: [
      "NIFTY",
      "BANKNIFTY",
      "FINNIFTY",
      "MIDCPNIFTY",
      "NIFTYNXT50",
      "NIFTYFPI",
    ],
  },
  BSE: {
    name: "BSE",
    reference: "https://www.bseindices.com/",
    benchmarks: [
      "BSE SENSEX",
      "BSE BANKEX",
      "BSE MIDCAP",
      "BSE INFORMATION TECHNOLOGY",
    ],
    derivativeOrder: ["SENSEX", "BANKEX", "SENSEX50", "FOCIT"],
  },
};
const broadNames = [
  "NIFTY 50",
  "NIFTY NEXT 50",
  "NIFTY 100",
  "NIFTY NEXT 100",
  "NIFTY 200",
  "NIFTY TOTAL MARKET",
  "NIFTY 500",
  "NIFTY 500 MULTICAP 50:25:25",
  "NIFTY500 LARGEMIDSMALL EQUAL-CAP WEIGHTED",
  "NIFTY MIDCAP 150",
  "NIFTY MIDCAP 50",
  "NIFTY MIDCAP SELECT",
  "NIFTY MIDCAP 100",
  "NIFTY SMALLCAP 500",
  "NIFTY SMALLCAP 250",
  "NIFTY SMALLCAP 50",
  "NIFTY SMALLCAP 100",
  "NIFTY MICROCAP 250",
  "NIFTY LARGEMIDCAP 250",
  "NIFTY MIDSMALLCAP 400",
  "NIFTY MIDSMALLCAP400 50:50",
  "NIFTY INDIA FPI 150",
  "INDIA VIX",
];
const sectorNames = [
  "NIFTY AUTO",
  "NIFTY BANK",
  "NIFTY CEMENT",
  "NIFTY CAPITAL GOODS",
  "NIFTY CHEMICALS",
  "NIFTY COMMERCIAL & TRANSPORT SERVICES",
  "NIFTY CONSTRUCTION",
  "NIFTY CONSUMER SERVICES",
  "NIFTY FINANCIAL SERVICES",
  "NIFTY FINANCIAL SERVICES 25/50",
  "NIFTY FINANCIAL SERVICES EX-BANK",
  "NIFTY FMCG",
  "NIFTY HEALTHCARE",
  "NIFTY HOSPITALS",
  "NIFTY HOUSING FINANCE",
  "NIFTY INSURANCE",
  "NIFTY IT",
  "NIFTY MEDIA",
  "NIFTY METAL",
  "NIFTY NBFC",
  "NIFTY PHARMA",
  "NIFTY POWER",
  "NIFTY PRIVATE BANK",
  "NIFTY PSU BANK",
  "NIFTY REALTY",
  "NIFTY REITS & REALTY",
  "NIFTY RETAIL",
  "NIFTY TELECOMMUNICATIONS",
  "NIFTY CONSUMER DURABLES",
  "NIFTY OIL AND GAS",
  "NIFTY500 HEALTHCARE",
  "NIFTY MIDSMALL FINANCIAL SERVICES",
  "NIFTY MIDSMALL HEALTHCARE",
  "NIFTY MIDSMALL IT & TELECOM",
];
const derivatives: Record<string, string> = {
  "NIFTY 50": "NIFTY",
  "NIFTY BANK": "BANKNIFTY",
  "NIFTY FINANCIAL SERVICES": "FINNIFTY",
  "NIFTY MIDCAP SELECT": "MIDCPNIFTY",
  "NIFTY NEXT 50": "NIFTYNXT50",
  "NIFTY INDIA FPI 150": "NIFTYFPI",
};
const nseIndexCatalog: IndexDefinition[] = [
  ...broadNames.map((name) => ({ name, family: "broad" as const })),
  ...sectorNames.map((name) => ({ name, family: "sectoral" as const })),
].map((index) => ({
  ...index,
  exchange: "NSE",
  id: `nse:${index.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  derivativeSymbol: derivatives[index.name],
  volatility: index.name === "INDIA VIX",
}));
export const indexCatalog = [...nseIndexCatalog, ...bseIndexCatalog];
export const isInCategory = (
  index: IndexDefinition,
  category: IndexCategory,
) =>
  category === "derivatives"
    ? !!index.derivativeSymbol
    : index.family === category;
