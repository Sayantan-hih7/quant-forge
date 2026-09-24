import type { QualificationWorkspace, RuleDefinition } from '../../qualification/types';
import type { MonitorDefinition } from '../types/monitor';
import { savedStrategyPairs } from '../../strategies/utils/strategyPairs';

const IST = 330 * 60000;
const DAY = 86400000;
export const demoSessionTime = (now: number) => Math.floor((now + IST) / DAY) * DAY - IST + 10 * 3600000;
export const sessionBounds = (time: number) => { const start = Math.floor((time + IST) / DAY) * DAY - IST + (9 * 60 + 15) * 60000; return { start, end: start + 375 * 60000 }; };
export const intervalMs = (cadence: RuleDefinition['cadence']) => cadence === 'daily' ? 375 * 60000 : parseInt(cadence) * 60000;
export function closedCandle(time: number, cadence: RuleDefinition['cadence']): number | undefined {
  const { start, end } = sessionBounds(time);
  if (time <= start) return undefined;
  if (cadence === 'daily') return time >= end ? end : undefined;
  const closed = start + Math.floor((Math.min(time, end) - start) / intervalMs(cadence)) * intervalMs(cadence);
  return closed > start ? closed : undefined;
}
export function nextCandle(time: number, cadence: RuleDefinition['cadence']): number | undefined {
  const { start, end } = sessionBounds(time);
  if (time >= end) return undefined;
  if (cadence === 'daily') return end;
  return Math.min(end, start + (Math.floor((Math.max(time, start) - start) / intervalMs(cadence)) + 1) * intervalMs(cadence));
}
export const clockLabel = (time?: number) => time === undefined ? '—' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time);
export const cadenceLabel = (cadence: RuleDefinition['cadence']) => cadence === 'daily' ? 'Daily candle close' : `${parseInt(cadence)}-minute candle close`;
export const definitionKey = (definition: MonitorDefinition) => JSON.stringify(definition);
export function monitorDefinitions(workspace?: QualificationWorkspace): MonitorDefinition[] {
  return savedStrategyPairs(workspace).filter(({ plan }) => !plan.needsReview).map(({ plan, entry, exit }) => ({ id: entry.id, name: plan.name, entry, exit, risk: plan.risk }));
}
