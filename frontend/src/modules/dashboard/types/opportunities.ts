import type { Horizon } from '../../qualification/types';

export interface StockOpportunity {
  id: string;
  symbol: string;
  name: string;
  layerId: string;
  strategy: string;
  horizon: Horizon;
  cacheId: string;
  side: 'BUY' | 'SELL';
  signalledAt: string;
  ltp: number;
  changePercent: number;
  entry: number;
  stopLoss: number;
  target: number;
  upside: number;
  rewardRisk: number;
  risk: 'Low' | 'Medium' | 'High';
}
