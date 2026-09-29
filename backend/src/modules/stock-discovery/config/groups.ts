import type { Criterion, DiscoveryGroup, Metric } from '../types.js';

const rule = (field: Metric, label: string, operator: Criterion['operator'], value: number, unit: string): Criterion => ({ field, label, operator, value, unit });
const liquid = [rule('price', 'Price', '>=', 20, '₹'), rule('turnover', 'Estimated traded value', '>=', 1, '₹ Cr')];
// These definitions drive both evaluation and the visible rules, keeping the explanation exact.
export const discoveryGroups: DiscoveryGroup[] = [
  { id: 'gainers', name: 'Top gainers', description: 'Liquid stocks moving up this session', family: 'session', criteria: [...liquid, rule('percent', 'Change vs previous close', '>', 0, '%')], rankBy: 'percent', rankLabel: 'Largest percentage gain first' },
  { id: 'losers', name: 'Top losers', description: 'Liquid stocks moving down this session', family: 'session', criteria: [...liquid, rule('percent', 'Change vs previous close', '<', 0, '%')], rankBy: 'percent', rankLabel: 'Largest percentage fall first', ascending: true },
  { id: 'active', name: 'Most traded', description: 'Where the most money is changing hands', family: 'session', criteria: liquid, rankBy: 'turnover', rankLabel: 'Highest estimated traded value first' },
  { id: 'momentum', name: 'Session momentum', description: 'Up 2% or more and trading above VWAP', family: 'session', criteria: [rule('price', 'Price', '>=', 20, '₹'), rule('turnover', 'Estimated traded value', '>=', 10, '₹ Cr'), rule('percent', 'Change vs previous close', '>=', 2, '%'), rule('aboveVwap', 'Price above session VWAP', '>', 0, '%')], rankBy: 'percent', rankLabel: 'Largest percentage gain first' },
  { id: 'large', name: 'Large companies', description: 'Market cap of ₹20,000 Cr or more', family: 'company', criteria: [rule('marketCap', 'Market cap', '>=', 20000, '₹ Cr')], rankBy: 'marketCap', rankLabel: 'Largest market cap first' },
  { id: 'medium', name: 'Mid-sized companies', description: 'Market cap from ₹5,000 to under ₹20,000 Cr', family: 'company', criteria: [rule('marketCap', 'Market cap', '>=', 5000, '₹ Cr'), rule('marketCap', 'Market cap', '<', 20000, '₹ Cr')], rankBy: 'marketCap', rankLabel: 'Largest market cap first' },
  { id: 'small', name: 'Smaller companies', description: 'Market cap from ₹500 to under ₹5,000 Cr', family: 'company', criteria: [rule('marketCap', 'Market cap', '>=', 500, '₹ Cr'), rule('marketCap', 'Market cap', '<', 5000, '₹ Cr')], rankBy: 'marketCap', rankLabel: 'Largest market cap first' },
  { id: 'quality', name: 'High ROE · low debt', description: 'ROE ≥15%, debt/equity ≤0.5, market cap ≥₹2,000 Cr', family: 'company', criteria: [rule('marketCap', 'Market cap', '>=', 2000, '₹ Cr'), rule('roe', 'Return on equity', '>=', 15, '%'), rule('debtEquity', 'Debt / equity', '>=', 0, '×'), rule('debtEquity', 'Debt / equity', '<=', 0.5, '×')], rankBy: 'roe', rankLabel: 'Highest ROE first' },
];
