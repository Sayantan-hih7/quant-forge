import { useSignalMonitorStore } from '../../signals/store/signalMonitorStore';
import { useQualificationStore } from '../../qualification/store/qualificationStore';
import { useDemoStore } from '../../../store/demoStore';
import { monthKey } from '../../strategies/utils/monthlyCycle';
import { monitorDefinitions, definitionKey } from '../../signals/utils/monitoring';
import { usePaperTradingStore } from '../store/paperTradingStore';
import type { PaperSession } from '../types';
import type { MonitorSignal } from '../../signals/types/monitor';

export function paperSignalProblem(owner: string, session: PaperSession, signal: MonitorSignal): string | undefined {
  const workspace = useSignalMonitorStore.getState().workspaces[owner];
  const actual = workspace?.signals.find(event => event.id === signal.id);
  if (!actual || actual.disposition !== 'ready' || workspace!.clock > actual.expiresAt || workspace!.feed !== 'healthy') return 'Wait for a fresh alert from a healthy sample feed.';
  if (session.events.some(event => event.signalId === signal.id)) return 'Already handled in this paper session.';
  if (signal.side === 'SELL') return session.positions.some(position => `${session.id}:${position.id}` === signal.positionId) ? undefined : 'This sell alert belongs to another holding.';
  const qualification = useQualificationStore.getState().workspaces[owner];
  const monitor = workspace!.monitors[signal.monitorId];
  const definition = monitorDefinitions(qualification).find(item => item.id === signal.monitorId);
  if (!definition || !monitor || definitionKey(definition) !== definitionKey(monitor.definition)) return 'Update the monitor to the saved strategy first.';
  if (session.paused || monitor.entryPaused || useDemoStore.getState().enginePaused) return 'New entries are paused.';
  if (session.entryRule.id !== signal.rule.id || session.entryRule.revision !== signal.rule.revision || session.exitRule.id !== definition.exit?.id || session.exitRule.revision !== definition.exit?.revision) return 'This session uses different saved rules. Backtest the current pair and create a new paper session.';
  if (!qualification?.caches[monthKey(Date.now())]?.candidates.some(stock => stock.symbol === signal.symbol)) return 'Stock is outside the current monthly list.';
  if (session.positions.some(position => position.symbol === signal.symbol)) return 'This stock is already held.';
  if (session.positions.length >= session.config.maxPositions) return 'Maximum open positions reached.';
}

export function confirmPaperSignal(owner: string, sessionId: string, signalId: string, quantity: number) {
  const session = usePaperTradingStore.getState().sessions[owner]?.find(item => item.id === sessionId);
  const signal = useSignalMonitorStore.getState().workspaces[owner]?.signals.find(item => item.id === signalId);
  if (!session || !signal) return 'The session or alert is no longer available.';
  return paperSignalProblem(owner, session, signal) ?? usePaperTradingStore.getState().fillSignal(owner, sessionId, signal, quantity);
}
