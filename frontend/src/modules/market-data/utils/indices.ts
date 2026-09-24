import type { IndexDefinition, IndexDirection, IndexQuote } from "../types/indices";

export function matchesIndexSearch(index: IndexDefinition, search: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const text = normalize(`${index.exchange} ${index.name} ${index.derivativeSymbol ?? ""}`);
  return text.includes(normalize(search)) || search.trim().split(/\s+/).every((term) => text.includes(normalize(term)));
}

const number = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const indexNumber = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : number.format(value);
export const directionOf = (value: number | null): IndexDirection =>
  value === null || !Number.isFinite(value) ? 'unknown' : value > 0 ? "up" : value < 0 ? "down" : "flat";
export const signedIndexNumber = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${indexNumber(Math.abs(value))}`;
export const directionLabel = { up: "Up", down: "Down", flat: "Unchanged", unknown: 'Unavailable' };
export const indexTime = (iso?: string) => iso && Number.isFinite(Date.parse(iso)) ? `${new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(iso))} IST` : 'Not available';
export const compareIndexValues = (a: number | null, b: number | null) => a === null ? (b === null ? 0 : -1) : b === null ? 1 : a - b;
export function movementCounts(quotes: IndexQuote[]) {
  return quotes.reduce(
    (counts, index) => {
      counts[directionOf(index.change)] += 1;
      return counts;
    },
    { up: 0, down: 0, flat: 0, unknown: 0 },
  );
}
export function indicesCsv(quotes: IndexQuote[]) {
  const rows = [
    [
      "Exchange",
      "Index",
      "Category",
      "Derivative symbol",
      "Last",
      "Change points",
      "Change percent",
      "Open",
      "High",
      "Low",
      "Previous close",
      "52-week high",
      "52-week low",
      "Snapshot",
      "Data",
      "Source URL",
      "Retrieved at",
    ],
    ...quotes.map((index) => [
      index.exchange,
      index.name,
      index.family === "broad" ? "Broad market" : "Sectoral",
      index.derivativeSymbol ?? "",
      index.last,
      index.change,
      index.percent,
      index.open,
      index.high,
      index.low,
      index.previousClose,
      index.high52w,
      index.low52w,
      index.asOf ?? '',
      index.source ?? 'Unavailable',
      index.sourceUrl ?? '',
      index.fetchedAt ?? '',
    ]),
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n")
  );
}
