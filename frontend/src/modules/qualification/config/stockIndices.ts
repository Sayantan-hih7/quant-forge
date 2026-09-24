export const stockIndices = [
  { value: 'nifty-50', label: 'NIFTY 50' },
  { value: 'nifty-next-50', label: 'NIFTY NEXT 50' },
  { value: 'nifty-100', label: 'NIFTY 100' },
  { value: 'nifty-200', label: 'NIFTY 200' },
  { value: 'nifty-500', label: 'NIFTY 500' },
] as const;

export type StockIndex = (typeof stockIndices)[number]['value'];
export const stockIndexLabel = (id: string) => stockIndices.find((index) => index.value === id)?.label ?? id;
