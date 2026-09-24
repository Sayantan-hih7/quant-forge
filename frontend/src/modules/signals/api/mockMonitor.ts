import { mockMarket } from '../../qualification/api/mockMarket';
import { ruleMatches } from '../../qualification/utils/evaluateRules';
import { paperQuote } from '../../paper-trading/store/paperTradingStore';
import { closedCandle, definitionKey, sessionBounds } from '../utils/monitoring';
import type { MonthlyCache } from '../../qualification/types';
import type { PaperSession } from '../../paper-trading/types';
import type { MonitorDefinition, MonitorSignal, MonitorWorkspace, StrategyMonitor, WatchedPosition } from '../types/monitor';

// Lookup only for retained paper positions. Entry evaluation never reads the full market.
const stockBySymbol = new Map(mockMarket.map(stock => [stock.symbol, stock]));
export function watchedPositions(monitor: StrategyMonitor, sessions: PaperSession[]): WatchedPosition[] {
  const held = sessions.filter(session => session.entryRule.id === monitor.definition.entry.id).flatMap(session => session.positions.flatMap(position => {
    const stock = stockBySymbol.get(position.symbol);
    return stock ? [{ id: `${session.id}:${position.id}`, symbol: position.symbol, quantity: position.quantity, price: paperQuote(session, position.symbol), stop: position.stop, target: position.target, source: 'Paper' as const, sessionId: session.id, exit: session.exitRule, overnight: session.config.overnight, entryPaused: session.paused, stock }] : [];
  }));
  return [...held, ...monitor.samplePositions];
}
export function samplePositions(definition: MonitorDefinition, cache: MonthlyCache): WatchedPosition[] {
  if (!definition.exit) return [];
  const symbols = new Set(cache.candidates.map(stock => stock.symbol));
  const outside = mockMarket.find(stock => !symbols.has(stock.symbol));
  return [cache.candidates[0], outside].filter(stock => !!stock).map(stock => ({ id: `sample:${definition.id}:${stock.symbol}`, symbol: stock.symbol, quantity: 10, price: stock.close, stop: stock.close * .98, target: stock.close * 1.04, source: 'Sample', exit: structuredClone(definition.exit!), overnight: definition.risk?.overnight ?? false, entryPaused: false, stock: structuredClone(stock) }));
}
export interface EvaluationInput { workspace: MonitorWorkspace; definition?: MonitorDefinition; cache?: MonthlyCache; sessions: PaperSession[]; globalPaused: boolean; manual: boolean }
export function evaluateMonitor(monitor: StrategyMonitor, input: EvaluationInput): { monitor: StrategyMonitor; signals: MonitorSignal[] } {
  const { workspace, definition, cache, sessions, globalPaused, manual } = input;
  const time = workspace.clock;
  const held = watchedPositions(monitor, sessions);
  const currentSymbols = new Set(cache?.candidates.map(stock => stock.symbol));
  const existingIds = new Set(workspace.signals.map(signal => signal.id));
  const signals: MonitorSignal[] = [];
  const next = { ...monitor, lastExitBars: { ...monitor.lastExitBars }, lastProtection: { ...monitor.lastProtection } };
  if (workspace.feed !== 'healthy' || (!manual && monitor.state !== 'monitoring')) return { monitor, signals };
  const staleRules = !definition || definitionKey(definition) !== definitionKey(monitor.definition);
  const matchingSessions = sessions.filter(session => session.entryRule.id === monitor.definition.entry.id);
  const manualPause = matchingSessions.some(session => session.paused);
  const record = (event: MonitorSignal) => {
    if (existingIds.has(event.id)) return;
    if (time > event.expiresAt) { event.disposition = 'expired'; event.explanation = 'The signal window has passed. Historical checks do not create fresh trade instructions.'; }
    existingIds.add(event.id); signals.push(event);
  };
  const entry = monitor.definition.entry;
  const bar = closedCandle(time, entry.cadence);
  if (bar !== undefined && bar > (monitor.lastEntryBar ?? 0)) {
    next.lastEntryBar = bar; next.lastEvaluation = time; next.lastCandle = bar; next.checkedCount = cache?.candidates.length ?? 0;
    for (const stock of cache?.candidates ?? []) {
      if (!ruleMatches(stock, entry)) continue;
      const reason = entry.horizon === 'intraday' && time >= sessionBounds(time).end - 15 * 60000 ? 'Intraday entry window closed. Session exits take priority.' : staleRules ? 'Saved rules changed. Update this monitor before accepting new entries.' : globalPaused ? 'Workspace entries are paused.' : monitor.entryPaused ? 'New entries paused for this monitor. Exit checks continue.' : manualPause ? 'A linked paper session paused entries after a manual override.' : held.some(position => position.symbol === stock.symbol) ? 'Already held. Another entry would duplicate the position.' : monitor.definition.risk && held.length >= monitor.definition.risk.maxPositions ? 'Maximum open positions reached.' : undefined;
      record({ id: `${monitor.definition.id}:${entry.revision}:${bar}:${stock.symbol}:BUY`, monitorId: monitor.definition.id, strategy: monitor.definition.name, symbol: stock.symbol, side: 'BUY', time, candle: bar, expiresAt: bar + (entry.cadence === 'daily' ? 300000 : 30000), price: stock.close, disposition: reason ? 'blocked' : 'ready', explanation: reason ?? 'Entry conditions matched the synthetic indicator fixture. Alert only; order sizing and submission are not connected.', trigger: 'Entry rule', source: manual ? 'Manual check' : 'Monitoring', rule: structuredClone(entry), custom: stock.qualificationSource === 'manual', outsideUniverse: false });
    }
  }
  for (const position of held) {
    const exitBar = closedCandle(time, position.exit.cadence);
    const protective = position.price <= position.stop ? 'Stop loss' : position.price >= position.target ? 'Profit target' : !position.overnight && time >= sessionBounds(time).end - 15 * 60000 ? 'Session exit' : undefined;
    const evaluateExit = exitBar !== undefined && exitBar > (monitor.lastExitBars[position.id] ?? 0);
    if (evaluateExit) next.lastExitBars[position.id] = exitBar;
    if (!protective && (!evaluateExit || !ruleMatches(position.stock, position.exit))) continue;
    const trigger = protective ?? 'Sell rule';
    if (protective && monitor.lastProtection[position.id] === protective) continue;
    if (protective) next.lastProtection[position.id] = protective;
    record({ id: `${monitor.definition.id}:${position.id}:${position.exit.revision}:${protective ? trigger : exitBar}:SELL`, monitorId: monitor.definition.id, strategy: monitor.definition.name, symbol: position.symbol, side: 'SELL', time, candle: protective ? undefined : exitBar, expiresAt: protective ? time + 300000 : exitBar! + (position.exit.cadence === 'daily' ? 300000 : 30000), price: position.price, disposition: 'ready', explanation: `${trigger} matched for a held ${position.source.toLowerCase()} position. Exit uses the position’s saved rules${currentSymbols.has(position.symbol) ? '.' : ', even outside the monthly entry list.'} No sell order is submitted.`, trigger, source: manual ? 'Manual check' : 'Monitoring', rule: structuredClone(position.exit), positionId: position.id, custom: position.stock.qualificationSource === 'manual', outsideUniverse: !currentSymbols.has(position.symbol) });
    next.lastEvaluation = time;
  }
  return { monitor: next, signals };
}
