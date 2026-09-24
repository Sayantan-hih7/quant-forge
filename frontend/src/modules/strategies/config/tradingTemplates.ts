import type { TradingHorizon, EvaluationTimeframe, QualificationCadence } from '../types/workspace';

export const horizonLabels: Record<TradingHorizon, string> = {
  intraday: 'Intraday', 'short-term': 'Short term', 'long-term': 'Long term',
};
export const horizonTimeframes: Record<TradingHorizon, EvaluationTimeframe[]> = {
  intraday: ['1m', '5m', '15m'], 'short-term': ['1h', '1d'], 'long-term': ['1d', '1w', '1mo'],
};
export const cadenceLabels: Record<QualificationCadence, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly',
};
export const qualificationDefaults: Record<TradingHorizon, { qualificationRule: string; qualificationCadence: QualificationCadence }> = {
  intraday: { qualificationRule: 'Average daily volume above 1 million shares; sufficient intraday volatility.', qualificationCadence: 'daily' },
  'short-term': { qualificationRule: 'Positive daily momentum and a consolidation pattern near resistance.', qualificationCadence: 'weekly' },
  'long-term': { qualificationRule: 'Consistent revenue growth, low debt-to-equity and sustained return on equity.', qualificationCadence: 'quarterly' },
};
export const tradingTemplates = [
  { id: 'opening-range', name: 'Opening range breakout', horizon: 'intraday' as const, timeframe: '15m' as const, entryRule: 'Close above the opening 15-minute range with increased volume', exitRule: 'Exit at session close or on a break below the opening range' },
  { id: 'momentum-pullback', name: 'Momentum pullback', horizon: 'short-term' as const, timeframe: '1d' as const, entryRule: 'Price reclaims the 20-day EMA after a pullback; RSI above 50', exitRule: 'Exit on a daily close below the 20-day EMA' },
  { id: 'position-trend', name: 'Position trend', horizon: 'long-term' as const, timeframe: '1w' as const, entryRule: 'Weekly close above the 30-week moving average', exitRule: 'Exit after two weekly closes below the 30-week moving average' },
  { id: 'rsi-reversal', name: 'RSI reversal', horizon: 'short-term' as const, timeframe: '1h' as const, entryRule: 'RSI crosses back above 30 with price above session VWAP', exitRule: 'Exit when RSI reaches 65 or the swing low breaks' },
  { id: 'custom', name: 'Custom strategy', horizon: 'intraday' as const, timeframe: '5m' as const, entryRule: '', exitRule: '' },
].map((template) => ({ ...template, ...qualificationDefaults[template.horizon] }));
