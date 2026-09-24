import dhanLogo from '../assets/logos/dhan.png';
import motilalLogo from '../assets/logos/motilal.png';
import zerodhaLogo from '../assets/logos/zerodha.png';

export const brokers = [
  { id: 'dhan', name: 'Dhan', logo: dhanLogo, color: '#17876b', description: 'Stocks, futures & options' },
  { id: 'motilal', name: 'Motilal Oswal', logo: motilalLogo, color: '#b8791b', description: 'Equity & derivatives' },
  { id: 'zerodha', name: 'Zerodha', logo: zerodhaLogo, color: '#4273d8', description: 'Kite trading account' },
] as const;
export type BrokerId = typeof brokers[number]['id'];
export const brokerById = (id: string) => brokers.find((broker) => broker.id === id);
