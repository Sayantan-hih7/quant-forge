import { marketTime } from '../../../shared/market-calendar.js';
/** Conservative NSE execution window until dated CAS membership is available.
 * This is a simulator restriction, not a claim that every NSE stock joins CAS.
 * Source: NSE Closing Auction Session, effective 2026-08-03. */
export function executionCloseMinute(id:string,now=Date.now()){
 return id.startsWith('NSE:')&&marketTime(now).date>='2026-08-03'?915:930;
}
export function squareOffMinute(id:string,now=Date.now()){
 return executionCloseMinute(id,now)===915?910:915;
}
export function executionOpen(id:string,now=Date.now()){
 const clock=marketTime(now);return clock.open&&clock.minute<executionCloseMinute(id,now);
}
