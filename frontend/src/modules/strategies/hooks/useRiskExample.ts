import { createContext, useContext } from 'react';

export interface RiskExample {
  entry: number | null;
  atr: number | null;
  signalLow: number | null;
  setSignalLow: (value: number | null) => void;
  setEntry: (value: number | null) => void;
  setAtr: (value: number | null) => void;
}
export const RiskExampleContext = createContext<RiskExample | null>(null);
export function useRiskExample() {
  const context = useContext(RiskExampleContext);
  if (!context) throw new Error('Risk example requires its editor provider');
  return context;
}
