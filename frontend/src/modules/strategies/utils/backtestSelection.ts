import type { Horizon } from '../../qualification/types';
import type { ScopedStock } from '../hooks/useQualifiedStockScope';
export const BACKTEST_STOCK_LIMIT=200;
/** Suitability is a research profile, never a forecast of returns. */
export function orderedBacktestStocks(stocks:ScopedStock[],horizon?:Horizon,historical=false){
 const matches=(stock:ScopedStock)=>!historical&&!!horizon&&!!stock.suitability?.profiles.some(p=>p.horizon===horizon&&p.status==='matched');
 return [...stocks].sort((a,b)=>Number(matches(b))-Number(matches(a))||a.symbol.localeCompare(b.symbol)||a.exchange.localeCompare(b.exchange)||a._id.localeCompare(b._id));
}
export function defaultBacktestSelection(stocks:ScopedStock[],horizon?:Horizon,historical=false){
 return orderedBacktestStocks(stocks,horizon,historical).slice(0,BACKTEST_STOCK_LIMIT).map(stock=>stock._id);
}
