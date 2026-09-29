export interface Watchlist { _id: string; name: string; ids: string[]; createdAt: string; updatedAt: string }
export interface WatchlistState { lists: Watchlist[]; universeCount: number }
export interface BrowseStock { _id: string; symbol: string; name: string; exchange: 'NSE' | 'BSE'; isin: string; active: boolean; discovery?: import('../stock-discovery/types').DiscoveryMatchData }
export interface BrowseStocks { items: BrowseStock[]; total: number; page: number; pageSize: number }
