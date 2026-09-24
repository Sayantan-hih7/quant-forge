import type { QualifiedStock, QualificationRules, StrategyWorkspace, TradingLayer, UniverseSnapshot } from '../types/workspace';
import { tradingTemplates } from '../config/tradingTemplates';

const examples = [
  ['RELIANCE', 'Reliance Industries', 'Energy'],
  ['HDFCBANK', 'HDFC Bank', 'Financials'],
  ['INFY', 'Infosys', 'Technology'],
  ['TCS', 'Tata Consultancy Services', 'Technology'],
  ['ICICIBANK', 'ICICI Bank', 'Financials'],
  ['LT', 'Larsen & Toubro', 'Industrials'],
  ['ITC', 'ITC', 'Consumer'],
  ['SUNPHARMA', 'Sun Pharmaceutical', 'Healthcare'],
  ['BHARTIARTL', 'Bharti Airtel', 'Telecom'],
  ['TATAMOTORS', 'Tata Motors', 'Automotive'],
  ['HINDUNILVR', 'Hindustan Unilever', 'Consumer'],
  ['AXISBANK', 'Axis Bank', 'Financials'],
  ['MARUTI', 'Maruti Suzuki', 'Automotive'],
  ['TITAN', 'Titan Company', 'Consumer'],
  ['ASIANPAINT', 'Asian Paints', 'Materials'],
  ['ULTRACEMCO', 'UltraTech Cement', 'Materials'],
];
const sectors = ['Financials', 'Technology', 'Industrials', 'Consumer', 'Healthcare', 'Energy'];
export const defaultRules: QualificationRules = { source: 'NSE 500', trend: 'above-ema50', minMomentum: 15, minTurnover: 5 };

// Synthetic design fixtures, not a current exchange constituent list or market feed.
export function qualifyMockUniverse(rules: QualificationRules, month: string): QualifiedStock[] {
  const [year, period] = month.split('-').map(Number);
  const shift = ((year * 12 + period) % 12) * 7;
  const count = rules.source === 'NSE 200' ? 200 : 500;
  return Array.from({ length: count }, (_, index) => {
    const rank = (index + shift) % 500;
    const sample = examples[index];
    const close = Number((125 + index * 7.35).toFixed(2));
    return {
      symbol: sample?.[0] ?? `DEMO${String(index + 1).padStart(4, '0')}`,
      name: sample?.[1] ?? `Sample equity ${String(index + 1).padStart(3, '0')}`,
      sector: sample?.[2] ?? sectors[index % sectors.length],
      close,
      ema50: Number((close * (rank < 400 ? 0.9 : 1.1)).toFixed(2)),
      ema200: Number((close * (rank < 350 ? 0.82 : 1.15)).toFixed(2)),
      momentum: Number((30 - (rank + 1) * 0.05).toFixed(2)),
      turnover: Number((5 + (index % 25) * 0.8).toFixed(1)),
    };
  }).filter((stock) =>
    stock.momentum >= rules.minMomentum && stock.turnover >= rules.minTurnover &&
    (rules.trend === 'any' || stock.close > (rules.trend === 'above-ema50' ? stock.ema50 : stock.ema200)),
  );
}
// Separate fixtures model qualification and signals; free-text rules are not executed.
export function qualifyMockLayer(layer: TradingLayer, snapshot: UniverseSnapshot, time: number): NonNullable<TradingLayer['watchlist']> {
  const divisor = layer.horizon === 'intraday' ? 20 : layer.horizon === 'short-term' ? 10 : 15;
  return {
    id: crypto.randomUUID(), snapshotId: snapshot.id, qualifiedAt: new Date(time).toISOString(),
    symbols: snapshot.stocks.filter((_, index) => index % divisor === 0).map((stock) => stock.symbol),
  };
}
export function evaluateMockLayer(layer: TradingLayer, snapshot: UniverseSnapshot, time: number): TradingLayer['evaluation'] {
  const watchlist = layer.watchlist;
  if (!watchlist || watchlist.snapshotId !== snapshot.id) return null;
  const allowed = new Set(snapshot.stocks.map((stock) => stock.symbol));
  return {
    snapshotId: snapshot.id, watchlistId: watchlist.id, evaluatedAt: new Date(time).toISOString(),
    matchedSymbols: watchlist.symbols.filter((symbol, index) => allowed.has(symbol) && index % 7 === 0),
  };
}
export function createSeedWorkspace(month: string): StrategyWorkspace {
  const qualifiedAt = `${month}-01T03:45:00.000Z`;
  const seed = (id: string, name: string, rules: QualificationRules, withLayers: boolean) => {
    const current: UniverseSnapshot = { id: `${id}-v1`, month, version: 1, qualifiedAt, rules, stocks: qualifyMockUniverse(rules, month) };
    const layers: TradingLayer[] = withLayers ? tradingTemplates.slice(0, 3).map((template, index) => {
      const layer: TradingLayer = { id: `${id}-layer-${index}`, name: template.name, templateId: template.id, horizon: template.horizon, timeframe: template.timeframe, qualificationRule: template.qualificationRule, qualificationCadence: template.qualificationCadence, entryRule: template.entryRule, exitRule: template.exitRule, mode: 'PAPER', status: index === 2 ? 'paused' : 'active', watchlist: null, evaluation: null };
      layer.watchlist = qualifyMockLayer(layer, current, Date.parse(qualifiedAt));
      return { ...layer, evaluation: index === 2 ? null : evaluateMockLayer(layer, current, Date.parse(qualifiedAt)) };
    }) : [];
    return { id, name, current, history: [], plannedRules: null, layers };
  };
  return {
    selectedBaseId: 'base-core',
    bases: [
      seed('base-core', 'Core momentum', defaultRules, true),
      seed('base-quality', 'Long-term strength', { ...defaultRules, trend: 'above-ema200', minMomentum: 24 }, false),
    ],
  };
}
