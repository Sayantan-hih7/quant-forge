/** AI-only format repair. Raw OHLC fields already mean a single candle.
 * Never change indicators, offsets, operators, timeframes or risk settings.
 * Repairs are disclosed in the draft review; manual validation remains strict.
 */
export function normalizePricePeriods(input: unknown) {
  const value = structuredClone(input);
  const repairs: string[] = [];
  if (!value || typeof value !== 'object') return { value, repairs };
  const proposal = (value as Record<string, unknown>).proposal;
  if (!proposal || typeof proposal !== 'object') return { value, repairs };
  for (const side of ['entry', 'exit']) {
    const rule = (proposal as Record<string, unknown>)[side] as {groups?: {conditions?: Record<string, unknown>[]}[]} | undefined;
    if (!Array.isArray(rule?.groups)) continue;
    for (const group of rule.groups) {
      if (!Array.isArray(group?.conditions)) continue;
      for (const c of group.conditions) {
        if (!c || typeof c !== 'object') continue;
        for (const operand of ['left', 'right']) {
          if (operand === 'right' && c.rightType !== 'indicator') continue;
          const field = c[operand], key = `${operand}Period`;
          if (!['open','high','low','close'].includes(String(field)) || !(key in c)) continue;
          const period = c[key];
          if (typeof period !== 'number' || !Number.isInteger(period) || period < 1 || period > 500) continue;
          delete c[key];
          repairs.push(`Corrected an AI formatting error: ${side === 'entry' ? 'buy' : 'sell'} rule ${field} uses one candle and has no moving-average period. Indicator periods and candle offsets were preserved.`);
        }
      }
    }
  }
  return { value, repairs: [...new Set(repairs)] };
}
