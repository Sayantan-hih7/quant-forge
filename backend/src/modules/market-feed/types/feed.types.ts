export type FeedProvider = 'auto' | 'motilal' | 'dhan';
export interface FeedInstrument { id: string; symbol: string; exchange: 'NSE' | 'BSE'; code?: number; securityId?: string }
export interface QuoteDetails { upperCircuit?:number|null;lowerCircuit?:number|null; previousClose?: number | null; open?: number | null; high?: number | null; low?: number | null; averagePrice?: number | null }
export interface LiveQuote { instrumentId: string; symbol: string; exchange: 'NSE' | 'BSE'; price: number; cumulativeVolume: number | null; at: string; receivedAt: string; source: 'motilal' | 'dhan'; session: string; details?: QuoteDetails }
export interface FeedConnection { state: 'disconnected' | 'connecting' | 'otp-required' | 'waiting' | 'live' | 'error'; session: string; ids: string[]; message: string; limit?: number; lastTickAt?: string; retryAt?: string }
export interface FeedStatus { state: FeedConnection['state']; message: string; updatedAt: string; instruments?: FeedInstrument[]; limit?: number; lastTickAt?: string; provider?: 'motilal' | 'dhan' | 'mixed'; session?: string; requestId?: string; retryAt?: string; connections?: Partial<Record<'motilal' | 'dhan', FeedConnection>>; unavailableIds?: string[]; marketClosed?: boolean;
  /** Separate Dhan Full-mode connection that supplies five-level depth for open research views. */
  depth?: { state: 'off' | 'connecting' | 'live' | 'error'; message: string; ids: string[] } }
export type ChildCommand = { type: 'start' | 'replace'; instruments: FeedInstrument[] } | { type: 'otp'; value: string } | { type: 'stop' };
export interface BookLevel { price: number; quantity: number; orders: number | null }
/** Order book and circuit limits. They change without a trade, so they travel separately from ticks. */
export interface LiveBook { bestBidAt?:string; instrumentId: string; source: 'motilal' | 'dhan'; receivedAt: string; session: string;
  bids?: BookLevel[]; asks?: BookLevel[]; upperCircuit?: number | null; lowerCircuit?: number | null;
  /** All pending buy/sell quantity across the whole book (Dhan Full packets only). */
  totalBuy?: number | null; totalSell?: number | null;
  /** Distinct depth levels the provider has sent for this stock in this session (Motilal API retail: 1). */
  levels?: number }
export type ChildEvent = { type: 'status'; state: FeedStatus['state']; message: string; limit?: number } | { type: 'tick'; quote: Omit<LiveQuote, 'session'> }
  | { type: 'book'; book: Omit<LiveBook, 'session'> };
