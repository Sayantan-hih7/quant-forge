/** Cost includes entry fees and is reduced proportionally by each exit fill. */
export function bookedPaperPnl(cashPaise: number, initialPaise: number, positions: { costPaise: number }[]) {
  return cashPaise + positions.reduce((sum, p) => sum + p.costPaise, 0) - initialPaise;
}

export function markPaperPosition(position: { quantity: number; costPaise: number }, quote?: { price: number; at: string; fresh: boolean; source: string }) {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return undefined;
  const pricePaise = Math.round(quote.price * 100), valuePaise = pricePaise * position.quantity;
  return { pricePaise, valuePaise, unrealizedPaise: valuePaise - position.costPaise, at: quote.at, fresh: quote.fresh, source: quote.source };
}
