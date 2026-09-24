import type { StockQuote } from '../types';
export const stockNumber = (value: number | null | undefined, digits = 2) => value == null ? '—' : value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const stockMoney = (value: number | null | undefined) => value == null ? '—' : `₹${stockNumber(value)}`;
export const stockSigned = (value: number | null | undefined, suffix = '') => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${stockNumber(Math.abs(value))}${suffix}`;
export const stockTone = (value: number | null | undefined) => value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative';
export const stockTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST' : 'Trade time unavailable';
export function priceState(quote: StockQuote | undefined, connected: boolean, now: number) {
  if (!quote) return 'Unavailable';
  if (quote.source === 'historical-close') return 'Historical close';
  if (connected && quote.source === 'dhan-stream' && quote.lastTradeAt && now - Date.parse(quote.lastTradeAt) >= -2000
    && now - Date.parse(quote.lastTradeAt) < 30_000 && now - Date.parse(quote.receivedAt) < 15_000) return 'Live';
  if (quote.source === 'dhan-snapshot' && now - Date.parse(quote.receivedAt) < 30_000) return 'Snapshot';
  return 'Last received';
}
