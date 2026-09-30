export interface FinancialPeriod { period: string; revenue: number | null; sales: number | null; netProfit: number | null; ebitda: number | null; eps: number | null }
export interface FinancialStatement { basis: 'consolidated' | 'standalone'; frequency: 'quarterly' | 'annual'; periods: FinancialPeriod[] }
export interface StockFinancialData { statements: FinancialStatement[]; source: string; sourceUrl?: string; fetchedAt: string | null; status: 'ready' | 'stale' | 'unavailable'; message?: string; currency: 'INR'; unit: 'crore' }
