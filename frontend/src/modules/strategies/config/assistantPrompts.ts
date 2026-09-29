export const strategyStarters = [
  { label: 'Intraday momentum', prompt: 'Create an intraday momentum strategy with a daily trend filter and 15-minute entry triggers. Include buy rules, sell rules and risk controls for paper testing.' },
  { label: 'Swing strategy', prompt: 'Create a swing strategy using daily momentum, with buy rules, sell rules and risk controls for paper testing.' },
  { label: 'Long-term trend', prompt: 'Create a long-term trend strategy using supported weekly indicators, with both buy and sell rules and paper-trading risk settings.' },
];
export const strategyRefinements = ['Set risk per trade to 0.5%', 'Set max positions to 3', 'Set sell RSI below 40'];
export const riskStarters = [
  { label: 'Explain my current settings', prompt: 'Explain my current risk settings in everyday language, in the order a trade happens. Explain the difference between taking profit and moving the stop. Do not change any settings.' },
  { label: 'Help me split my exits', prompt: 'I want to sell some shares at one profit level and the rest later. Help me set this up. Ask only for details you need and keep unrelated settings unchanged.' },
  { label: 'Protect profit after a rise', prompt: 'I want my stop to move up after the trade starts making money. Help me understand the choices, then ask only what is needed before building the settings.' },
];
