import { env } from '../src/config/env.js';
import type { StrategyDraft, Risk } from '../src/modules/strategies/validations/strategy.validation.js';

const condition = (left: string, frame: string, operator: string, right: string | number, extra = {}) => ({
  left, leftFrame: frame, operator, rightType: typeof right === 'number' ? 'value' : 'indicator',
  right: typeof right === 'string' ? right : 'ema21', rightFrame: frame,
  value: typeof right === 'number' ? right : 0, multiplier: 1, tolerance: 2, ...extra,
});
const rule = (side: 'BUY' | 'SELL', horizon: string, cadence: string, conditions: object[], logic = 'AND') => ({
  name: side === 'BUY' ? 'Buy entry' : 'Sell exit', description: 'Paper research rules; evaluate on completed candles.',
  tier: 'tactical', side, horizon, cadence, logic: 'AND', groups: [{ logic, conditions }],
});
const risk: Risk = {
  initialCapital: 100000, riskPercent: 0.25, maxPositions: 3, timeframe: '5m', stopMode: 'ATR', stopPercent: 2,
  atrPeriod: 14, atrMultiplier: 2, targetR: 2, overnight: false, slippagePercent: 0.02, feePercent: 0.03,
  entryOrderType: 'market', exitTargets: [{ basis: 'risk', value: 1, closePercent: 40 }, { basis: 'risk', value: 2, closePercent: 60 }],
  stopManagement: { breakeven: { trigger: 'target', at: 1 }, trailing: { trigger: 'target', at: 1, distanceR: 1 } },
};
export const paperResearchPlans: { id: string; draft: StrategyDraft }[] = [
  { id: '593c7c89-a362-4f30-a334-f1d43c000001', draft: {
    name: 'Intraday · Liquid momentum',
    entry: rule('BUY', 'intraday', '5m', [condition('close', '5m', 'gt', 'vwap'), condition('ema5', '5m', 'gt', 'ema21'), condition('rsi', '5m', 'between', 50, { upper: 68 }), condition('rvol', '5m', 'gte', 1)]),
    exit: rule('SELL', 'intraday', '5m', [condition('close', '5m', 'lt', 'vwap'), condition('ema5', '5m', 'lt', 'ema21')], 'OR'), risk,
  } },
  { id: '593c7c89-a362-4f30-a334-f1d43c000002', draft: {
    name: 'Swing · Quality pullback',
    entry: rule('BUY', 'swing', 'daily', [condition('close', '1d', 'gt', 'sma200'), condition('ema5', '1d', 'gt', 'ema21'), condition('close', '1d', 'gte', 'ema21'), condition('close', '1d', 'within', 'ema21', { tolerance: 3 }), condition('rsi', '1d', 'between', 50, { upper: 65 })]),
    exit: rule('SELL', 'swing', 'daily', [condition('close', '1d', 'lt', 'ema21'), condition('rsi', '1d', 'lt', 45)], 'OR'),
    risk: { ...risk, riskPercent: 0.5, timeframe: '1d', overnight: true, atrMultiplier: 2.5, targetR: 3, slippagePercent: 0.05, feePercent: 0.1,
      exitTargets: [{ basis: 'risk', value: 1.5, closePercent: 40 }, { basis: 'risk', value: 3, closePercent: 60 }],
    },
  } },
  { id: '593c7c89-a362-4f30-a334-f1d43c000003', draft: {
    name: 'Long term · Weekly trend',
    entry: rule('BUY', 'long-term', 'daily', [condition('close', '1d', 'gt', 'sma200'), condition('close', '1w', 'gt', 'ema21'), condition('ema5', '1w', 'gt', 'ema21'), condition('rsi', '1w', 'between', 50, { upper: 70 })]),
    exit: rule('SELL', 'long-term', 'daily', [condition('close', '1w', 'lt', 'ema21')]),
    risk: { ...risk, riskPercent: 0.5, timeframe: '1d', overnight: true, atrMultiplier: 3, targetR: 4, slippagePercent: 0.05, feePercent: 0.1,
      exitTargets: [{ basis: 'risk', value: 2, closePercent: 40 }, { basis: 'risk', value: 4, closePercent: 60 }],
    },
  } },
];

// Explicit maintenance command; never seeds, trades or overwrites on app startup.
if (process.argv.includes('--apply')) {
  const base = `http://127.0.0.1:${env.PORT}/api`;
  const headers = { Authorization: `Bearer ${env.WORKSPACE_TOKEN}`, 'Content-Type': 'application/json' };
  const paper = await (await fetch(base + '/paper', { headers })).json() as { sessions: { active: boolean }[]; positions: unknown[] };
  if (paper.sessions.some(s => s.active) || paper.positions.length) throw new Error('Stop previous monitoring and review holdings before applying research plans');
  const saved = await (await fetch(base + '/strategies', { headers })).json() as { _id: string; revision: number }[];
  for (const plan of paperResearchPlans) {
    const response = await fetch(base + '/strategies/' + plan.id, { method: 'PUT', headers, body: JSON.stringify({ draft: plan.draft, expectedRevision: saved.find(s => s._id === plan.id)?.revision ?? 0 }) });
    const result = await response.json() as { message?: string; name: string; revision: number };
    if (!response.ok) throw new Error(result.message ?? 'Strategy save failed');
    console.log(JSON.stringify({ name: result.name, revision: result.revision }));
  }
} else console.log(JSON.stringify(paperResearchPlans, null, 2));
