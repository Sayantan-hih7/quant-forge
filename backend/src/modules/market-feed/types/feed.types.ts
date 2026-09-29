export type FeedProvider = 'auto' | 'motilal' | 'dhan';
export interface FeedInstrument { id: string; symbol: string; exchange: 'NSE' | 'BSE'; code?: number; securityId?: string }
export interface QuoteDetails { previousClose?: number | null; open?: number | null; high?: number | null; low?: number | null; averagePrice?: number | null }
export interface LiveQuote { instrumentId: string; symbol: string; exchange: 'NSE' | 'BSE'; price: number; cumulativeVolume: number | null; at: string; receivedAt: string; source: 'motilal' | 'dhan'; session: string; details?: QuoteDetails }
export interface FeedConnection { state: 'disconnected' | 'connecting' | 'otp-required' | 'waiting' | 'live' | 'error'; session: string; ids: string[]; message: string; limit?: number; lastTickAt?: string; retryAt?: string }
export interface FeedStatus { state: FeedConnection['state']; message: string; updatedAt: string; instruments?: FeedInstrument[]; limit?: number; lastTickAt?: string; provider?: 'motilal' | 'dhan' | 'mixed'; session?: string; requestId?: string; retryAt?: string; connections?: Partial<Record<'motilal' | 'dhan', FeedConnection>>; unavailableIds?: string[]; marketClosed?: boolean }
export type ChildCommand = { type: 'start' | 'replace'; instruments: FeedInstrument[] } | { type: 'otp'; value: string } | { type: 'stop' };
export type ChildEvent = { type: 'status'; state: FeedStatus['state']; message: string; limit?: number } | { type: 'tick'; quote: Omit<LiveQuote, 'session'> };
