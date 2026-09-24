export interface FeedInstrument { id: string; symbol: string; exchange: 'NSE' | 'BSE'; code: number }
export interface LiveQuote { instrumentId: string; symbol: string; exchange: 'NSE' | 'BSE'; price: number; cumulativeVolume: number | null; at: string; receivedAt: string; source: 'motilal'; session: string }
export interface FeedStatus { state: 'disconnected' | 'connecting' | 'otp-required' | 'waiting' | 'live' | 'error'; message: string; updatedAt: string; instruments?: FeedInstrument[]; limit?: number; lastTickAt?: string }
export type ChildCommand = { type: 'start'; instruments: FeedInstrument[] } | { type: 'otp'; value: string } | { type: 'stop' };
export type ChildEvent = { type: 'status'; state: FeedStatus['state']; message: string; limit?: number } | { type: 'tick'; quote: Omit<LiveQuote, 'session'> };
