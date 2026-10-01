import type { PaperOrder, PaperPosition, PaperSession } from '../models/paper.model.js';
import type { LiveQuote } from '../../market-feed/types/feed.types.js';
import { initialRiskDistance, exceedsStopLimit, stopLimitMessage } from './stop-management.js';
import { positionTargets } from './exit-targets.js';

/** The same conservative risk/cash ceilings used at fill; estimates reserve no cash. */
export function buySize(session: PaperSession, positions: PaperPosition[], fill: number, distance: number, risk = session.strategy.risk) {
  const equity = session.cashPaise + positions.reduce((sum,p) => sum + Math.min(p.entryPaise,p.stopPaise)*p.quantity,0);
  return { maxRisk: Math.floor(equity*risk.riskPercent/100/distance), maxCash: Math.floor(session.cashPaise/(fill*(1+risk.feePercent/100))) };
}
export function orderEstimate(order: PaperOrder, session: PaperSession, positions: PaperPosition[], quote?: LiveQuote) {
  if (!quote) return { message: 'Waiting for a fresh price to estimate shares and levels.' };
  if (order.side === 'SELL') return { pricePaise: Math.round(quote.price*100), quantity: order.quantity || positions.find(p=>p.instrumentId===order.instrumentId)?.quantity || 0, message:order.limitPaise!==undefined&&Math.round(quote.price*100)<order.limitPaise?'Waiting for the sell limit or higher.':undefined };
  const risk = order.plan ?? session.strategy.risk, limit = order.limitPaise, manual = session.mode === 'manual';
  const fill = Math.min(limit??Infinity, Math.round(quote.price*100*(1+risk.slippagePercent/100)));
  const distance = initialRiskDistance(risk,fill,order.atr,order.signalLow);
  if (!Number.isFinite(distance) || distance<=0 || distance>=fill) return { message: 'An initial stop cannot be calculated from the available data.' };
  if (exceedsStopLimit(risk,fill,distance)) return { message: stopLimitMessage(risk,fill,distance), quantity: 0, pricePaise: fill, stopPaise: fill-distance };
  if (positions.some(p=>p.instrumentId===order.instrumentId) || positions.length>=risk.maxPositions) return { message: 'An existing position or position limit blocks this entry.' };
  const { maxRisk,maxCash }=buySize(session,positions,fill,distance,risk), quantity=order.quantity||Math.min(maxRisk,maxCash);
  if(quantity<1 || (!manual && quantity>maxRisk) || quantity>maxCash) return { message: manual ? 'Not enough paper cash for this quantity.' : 'Not enough available cash or risk allowance for this order.' };
  try {
    const targets=positionTargets(risk,fill,quantity,distance);
    return { pricePaise:fill,quantity,stopPaise:fill-distance,targetPaise:order.plan?.noTarget?undefined:targets?.find(t=>!t.completed)?.pricePaise??Math.round(fill+distance*risk.targetR),riskPaise:distance*quantity,
      message:limit!==undefined && quote.price*100>limit?'Waiting for the buy limit. Quantities are recalculated at fill.':'Estimate only. Cash and risk limits are checked again at fill.' };
  } catch { return { message:'Profit targets are invalid at this price.' }; }
}
