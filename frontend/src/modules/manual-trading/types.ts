import type { PaperOrder, PaperPosition } from '../paper-trading/hooks/useBackendPaper';

export type Product = 'delivery' | 'intraday';
export type StopMode = 'percent' | 'price' | 'atr' | 'trailing';
export interface ManualTrigger {
  _id: string; instrumentId: string; symbol: string; side: 'BUY' | 'SELL'; cadence: '1m' | '5m' | '15m' | 'daily'; quantity: number;
  status: 'active' | 'triggered' | 'cancelled' | 'expired' | 'failed'; validUntil: string; createdAt: string; checkedAt?: string; triggeredAt?: string; message?: string;
  rule: { logic: 'AND' | 'OR'; groups: { logic: 'AND' | 'OR'; conditions: Record<string, unknown>[] }[] };
  plan?: { overnight: boolean };
}
export interface ManualAccount { _id: string; cashPaise: number; initialPaise: number; holdingsPaise: number; equityPaise: number; createdAt: string; openPositions: number }
export interface ManualOverview {
  account: ManualAccount | null;
  positions?: (PaperPosition & { costPaise: number; plan?: { overnight: boolean; noTarget?: boolean } })[];
  orders?: (PaperOrder & { triggerPaise?: number; plan?: { overnight: boolean } })[];
  triggers?: ManualTrigger[]; marketOpen?: boolean; workerRunning?: boolean;
}
