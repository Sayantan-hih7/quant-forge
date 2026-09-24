export const strategyStarters = [
  { label: 'Intraday momentum', prompt: 'Create an intraday momentum strategy with a daily trend filter and 15-minute entry triggers. Include buy rules, sell rules and risk controls for paper testing.' },
  { label: 'Swing strategy', prompt: 'Create a swing strategy using daily momentum, with buy rules, sell rules and risk controls for paper testing.' },
  { label: 'Long-term trend', prompt: 'Create a long-term trend strategy using supported weekly indicators, with both buy and sell rules and paper-trading risk settings.' },
];
export const strategyRefinements = ['Set risk per trade to 0.5%', 'Set max positions to 3', 'Set sell RSI below 40'];
