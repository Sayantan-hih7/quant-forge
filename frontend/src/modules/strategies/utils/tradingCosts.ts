/** Dhan-style cash estimate, rate snapshot 2026-10-05. Not a contract note.
 * https://dhan.co/pricing/ — exchange rate is explicit because BSE groups differ.
 * Each simulated delivery sell is one DP instruction. Same-day netting is not modelled.
 */
export interface CostRisk {costModel?:'flat'|'indian-cash';exchangeFeePercent?:number;overnight:boolean;feePercent:number}
// NSE/FA/73061: from 1 March 2026, IPFT Rs 0.01/crore (1e-9), not Rs 10/crore.
const round=(value:number)=>Math.round(value+1e-8);
export function tradeFeePaise(gross:number,side:'BUY'|'SELL',risk:CostRisk){
 if(risk.costModel!=='indian-cash')return round(gross*risk.feePercent/100);
 const brokerage=risk.overnight?0:round(Math.min(2000,gross*0.0003));
 const exchange=round(gross*(risk.exchangeFeePercent??0.0030699)/100),sebi=round(gross*0.000001),ipft=round(gross*0.000000001);
 const stt=round(gross*(risk.overnight?0.001:side==='SELL'?0.00025:0)/100)*100;
 const stamp=side==='BUY'?round(gross*(risk.overnight?0.00015:0.00003)/100)*100:0;
 const gst=round((brokerage+exchange+sebi+ipft)*0.18),dp=risk.overnight&&side==='SELL'?1475:0;
 return brokerage+exchange+sebi+ipft+stt+stamp+gst+dp;
}
export function affordableShares(cash:number,price:number,risk:CostRisk){
 let lo=0,hi=Math.max(0,Math.floor(cash/price));
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(mid*price+tradeFeePaise(mid*price,'BUY',risk)<=cash)lo=mid;else hi=mid-1;}return lo;
}

