import type { CandidateStock, Metric, Timeframe } from '../types';
import type { StockIndex } from '../config/stockIndices';
export const MARKET_SIZE = 6200;
const examples = [
  ['RELIANCE', 'Reliance Industries'], ['HDFCBANK', 'HDFC Bank'], ['INFY', 'Infosys'], ['TCS', 'Tata Consultancy Services'],
  ['ICICIBANK', 'ICICI Bank'], ['LT', 'Larsen & Toubro'], ['ITC', 'ITC'], ['SUNPHARMA', 'Sun Pharmaceutical'],
  ['BHARTIARTL', 'Bharti Airtel'], ['TATAMOTORS', 'Tata Motors'], ['HINDUNILVR', 'Hindustan Unilever'], ['AXISBANK', 'Axis Bank'],
  ['MARUTI', 'Maruti Suzuki'], ['TITAN', 'Titan Company'], ['ASIANPAINT', 'Asian Paints'], ['ULTRACEMCO', 'UltraTech Cement'],
  ['SBIN', 'State Bank of India'], ['BAJFINANCE', 'Bajaj Finance'], ['KOTAKBANK', 'Kotak Mahindra Bank'], ['WIPRO', 'Wipro'],
  ['HCLTECH', 'HCL Technologies'], ['TECHM', 'Tech Mahindra'], ['TATASTEEL', 'Tata Steel'], ['JSWSTEEL', 'JSW Steel'],
  ['COALINDIA', 'Coal India'], ['NTPC', 'NTPC'], ['POWERGRID', 'Power Grid'], ['ONGC', 'Oil and Natural Gas Corporation'],
  ['BAJAJFINSV', 'Bajaj Finserv'], ['EICHERMOT', 'Eicher Motors'], ['HEROMOTOCO', 'Hero MotoCorp'], ['DRREDDY', 'Dr Reddy’s Laboratories'],
  ['CIPLA', 'Cipla'], ['DIVISLAB', 'Divi’s Laboratories'], ['APOLLOHOSP', 'Apollo Hospitals'], ['NESTLEIND', 'Nestlé India'],
  ['BRITANNIA', 'Britannia Industries'], ['TATACONSUM', 'Tata Consumer Products'], ['GRASIM', 'Grasim Industries'], ['ADANIPORTS', 'Adani Ports'],
  ['HINDALCO', 'Hindalco Industries'], ['BPCL', 'Bharat Petroleum'], ['IOC', 'Indian Oil'], ['GAIL', 'GAIL India'],
  ['BEL', 'Bharat Electronics'], ['HAL', 'Hindustan Aeronautics'], ['SIEMENS', 'Siemens'], ['ABB', 'ABB India'],
  ['DABUR', 'Dabur India'], ['GODREJCP', 'Godrej Consumer Products'], ['PIDILITIND', 'Pidilite Industries'], ['BERGEPAINT', 'Berger Paints'],
  ['AMBUJACEM', 'Ambuja Cements'], ['ACC', 'ACC'], ['DLF', 'DLF'], ['GODREJPROP', 'Godrej Properties'],
  ['TRENT', 'Trent'], ['INDHOTEL', 'Indian Hotels'], ['IRCTC', 'IRCTC'], ['PERSISTENT', 'Persistent Systems'],
  ['COFORGE', 'Coforge'], ['LTIM', 'LTIMindtree'], ['MOTHERSON', 'Samvardhana Motherson'], ['BOSCHLTD', 'Bosch'],
];
const sectors = ['Financials', 'Technology', 'Industrials', 'Consumer', 'Healthcare', 'Energy'];
const sectorExamples: Record<string, string[]> = {
  Financials: ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'SBIN', 'BAJFINANCE', 'KOTAKBANK', 'BAJAJFINSV'],
  Technology: ['INFY', 'TCS', 'WIPRO', 'HCLTECH', 'TECHM', 'PERSISTENT', 'COFORGE', 'LTIM'],
  Healthcare: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'],
  Energy: ['RELIANCE', 'COALINDIA', 'NTPC', 'POWERGRID', 'ONGC', 'BPCL', 'IOC', 'GAIL'],
  Industrials: ['LT', 'TATASTEEL', 'JSWSTEEL', 'GRASIM', 'ADANIPORTS', 'HINDALCO', 'BEL', 'HAL', 'SIEMENS', 'ABB', 'ULTRACEMCO', 'AMBUJACEM', 'ACC', 'PIDILITIND'],
  'Real estate': ['DLF', 'GODREJPROP'],
  Telecom: ['BHARTIARTL'],
};
const exampleSector = (index: number) => examples[index] ? Object.entries(sectorExamples).find(([, symbols]) => symbols.includes(examples[index][0]))?.[0] ?? 'Consumer' : sectors[index % sectors.length];
// Illustrative, overlapping memberships for the UI; these are not exchange constituent data.
function mockIndices(position: number): StockIndex[] {
  const indices: StockIndex[] = [];
  if (position < 50) indices.push('nifty-50');
  else if (position < 100) indices.push('nifty-next-50');
  if (position < 100) indices.push('nifty-100');
  if (position < 200) indices.push('nifty-200');
  if (position < 500) indices.push('nifty-500');
  return indices;
}
// All metrics and memberships are synthetic. Named instruments are illustrative.
export const mockMarket: CandidateStock[] = Array.from({ length: MARKET_SIZE }, (_, index) => ({
  index, symbol: examples[index]?.[0] ?? `DEMO${String(index + 1).padStart(4, '0')}`,
  indices: mockIndices(index),
  name: examples[index]?.[1] ?? `Sample equity ${index + 1}`, sector: exampleSector(index),
  close: Number((160 + index * 27.65).toFixed(2)),
  marketCap: index < 36 ? 15000 + index * 2100 : index < 80 ? 4000 + index * 35 : 300 + index % 20 * 30,
  turnover: index < 36 ? 15 + index % 20 : index < 80 ? 5 + index % 10 : 0.5 + index % 6,
  debtEquity: index < 36 ? 0.2 : index < 62 ? 0.7 : index < 80 ? 1.2 : 2.4,
  pledge: index < 36 ? 0 : index < 62 ? 2 : index < 80 ? 4 : 18,
  avgVolume20: 600000 + index % 25 * 220000, growth: 10 + index % 6 * 4, roe: 12 + index % 12,
}));
const membershipsBySymbol = new Map(mockMarket.map((stock) => [stock.symbol, stock.indices]));
// Enrich older mock snapshots without replacing their candidates or saved metrics.
export function restoreMockIndices(stock: CandidateStock): CandidateStock {
  return Array.isArray(stock.indices) ? stock : { ...stock, indices: [...(membershipsBySymbol.get(stock.symbol) ?? [])] };
}
export function metricValue(stock: CandidateStock, metric: Metric, timeframe: Timeframe, previous = false): number {
  if (metric in stock && !['close', 'volume'].includes(metric)) return stock[metric as keyof CandidateStock] as number;
  const factor = ['latest', '1m', '5m', '15m', '4h', '1d', '1w', '1mo', '1q'].indexOf(timeframe);
  const price = stock.close * (1 + factor * 0.001) * (previous ? 0.99 : 1);
  const bullish = stock.index % 4 !== 0;
  const relativeVolume = 1 + stock.index % 5 * 0.55;
  switch (metric) {
    case 'close': return price;
    case 'sma200': return price * (stock.index < 120 ? 0.82 : 1.12);
    case 'ema5': return price * (previous && stock.index % 3 === 1 ? 0.975 : bullish ? 0.995 : 1.02);
    case 'ema20': return price * (bullish ? 0.99 : 1.03);
    case 'vwap': return price * (stock.index % 3 ? 0.994 : 1.008);
    case 'rvol': return relativeVolume;
    case 'volume': return stock.avgVolume20 * relativeVolume;
    case 'rsi': return 45 + stock.index % 8 * 4;
    default: return 0;
  }
}
