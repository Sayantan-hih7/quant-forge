interface HistoryStock { id: string; intraday: { time: string }[] }
export interface IntradayHistoryQuality {
  sessionsChecked: number;
  incompleteSessions: number;
  missingMinutes: number;
  missingExitSessions: number;
  affected: { instrumentId: string; incompleteSessions: number; missingMinutes: number; missingExitSessions: number }[];
}

/** Audit observed regular sessions only. A missing minute is never a fabricated candle. */
export function intradayHistoryQuality(stocks: HistoryStock[], config: { from: string; to: string }, overnight: boolean): IntradayHistoryQuality {
  const result: IntradayHistoryQuality = { sessionsChecked: 0, incompleteSessions: 0, missingMinutes: 0, missingExitSessions: 0, affected: [] };
  const from = Date.parse(config.from), to = Date.parse(config.to);
  for (const stock of stocks) {
    const sessions = new Map<string, Set<number>>();
    for (const row of stock.intraday) {
      const at = Date.parse(row.time);
      if (at < from || at + 60_000 > to) continue;
      const date = new Date(at + 19_800_000).toISOString().slice(0, 10);
      const times = sessions.get(date) ?? new Set<number>(); times.add(at); sessions.set(date, times);
    }
    const item = { instrumentId: stock.id, incompleteSessions: 0, missingMinutes: 0, missingExitSessions: 0 };
    for (const [date, times] of sessions) {
      const open = Date.parse(`${date}T09:15:00+05:30`), close = Date.parse(`${date}T15:30:00+05:30`);
      // Partial requested days cannot establish whether the complete session exists.
      if (from > open || to < close) continue;
      result.sessionsChecked++;
      let missing = 0;
      for (let at = open; at < close; at += 60_000) if (!times.has(at)) missing++;
      if (missing) { item.incompleteSessions++; item.missingMinutes += missing; }
      if (!overnight && ![...times].some(at => at >= close - 15 * 60_000 && at < close)) item.missingExitSessions++;
    }
    if (item.incompleteSessions) result.affected.push(item);
    result.incompleteSessions += item.incompleteSessions;
    result.missingMinutes += item.missingMinutes;
    result.missingExitSessions += item.missingExitSessions;
  }
  return result;
}
