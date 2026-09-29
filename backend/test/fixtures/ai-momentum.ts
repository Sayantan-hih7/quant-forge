/** Synthetic public example: no user strategy or market observations. */
export const mondayPrompt = `Create "Monday Momentum Paper Test", a long-only intraday strategy for my published monthly qualified stocks. Evaluate completed 15-minute candles.
BUY only when ALL match: market cap >= Rs 10,000 crore; last completed daily turnover >= Rs 20 crore; daily close > daily EMA20; 15-minute EMA5 crosses above EMA20; 15-minute close > VWAP; 15-minute RSI14 is between 50 and 65.
SELL remaining shares when 15-minute EMA5 crosses below EMA20.
Use Rs 1,00,000 paper capital, risk 0.5% of equity per trade, maximum 2 open positions, market entry and no overnight holding.
Initial stop: 2 times ATR14 on 15-minute candles. Sell 50% of original shares at 1.5R and the remainder at 2.5R. Move stop to entry after Target 1 fills. No additional trailing.
Use 0.05% slippage and 0.03% fees per side as test estimates.
Ask only necessary questions. Flag unsupported requirements. Explain the plan and required data; do not claim stocks will win. Prepare a draft only.`;

const compare = (left: string, frame: string, operator: string, right: string | number) => ({
  left, leftFrame: frame, operator, rightType: typeof right === 'number' ? 'value' : 'indicator',
  value: typeof right === 'number' ? right : 0, right: typeof right === 'string' ? right : left,
  rightFrame: frame, multiplier: 1, tolerance: 2,
});

export const momentumProposal = {
  name: 'Monday Momentum Paper Test', horizon: 'intraday', cadence: '15m',
  entry: { logic: 'AND', groups: [{ logic: 'AND', conditions: [
    compare('marketCap', 'latest', 'gte', 10000), compare('turnover', '1d', 'gte', 20),
    compare('close', '1d', 'gt', 'ema20'), compare('ema5', '15m', 'crossAbove', 'ema20'),
    compare('close', '15m', 'gt', 'vwap'), compare('rsi', '15m', 'gte', 50), compare('rsi', '15m', 'lte', 65),
  ] }] },
  exit: { logic: 'AND', groups: [{ logic: 'AND', conditions: [compare('ema5', '15m', 'crossBelow', 'ema20')] }] },
  risk: { initialCapital: 100000, riskPercent: 0.5, maxPositions: 2, timeframe: '15m', stopMode: 'ATR',
    stopPercent: 2, atrPeriod: 14, atrMultiplier: 2, targetR: 2, overnight: false,
    entryOrderType: 'market', slippagePercent: 0.05, feePercent: 0.03,
    exitTargets: [{ basis: 'risk', value: 1.5, closePercent: 50 }, { basis: 'risk', value: 2.5, closePercent: 50 }],
    stopManagement: { breakeven: { trigger: 'target', at: 1 } },
  },
};

export const turnoverQuestion = {
  id: 'turnover_measurement', question: 'Use average daily turnover instead of the last trading day?',
  reason: 'The supported field averages exchange turnover over an imported month; it is not yesterday\'s turnover.',
  options: ['Use the monthly average >= Rs 20 crore', 'Remove the turnover condition'],
};
