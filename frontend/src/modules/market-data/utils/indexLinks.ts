import type { IndexDefinition } from "../types/indices";

export function indexDetailsPath(index: IndexDefinition) {
  const params = new URLSearchParams({
    exchange: index.exchange,
    category: index.family,
    index: index.id,
  });
  return `/market-data/indices?${params}`;
}
