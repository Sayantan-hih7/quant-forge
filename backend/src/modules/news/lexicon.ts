/**
 * Fast, explainable fallback scorer for Indian market headlines. It is used immediately for every
 * story and whenever the AI classifier is unavailable; AI results replace it when they arrive.
 */
export type EventType = 'results' | 'orders' | 'corporate-action' | 'deal' | 'rating' | 'regulatory' | 'management' | 'legal' | 'guidance' | 'market-move' | 'macro' | 'other';
const PHRASES: [RegExp, number, EventType?][] = [
  [/\b(bags?|wins?|secures?|receives?|bagged|won|secured)\b.{0,40}\b(order|orders|contract|contracts|deal)\b/i, 0.7, 'orders'],
  [/\border (win|inflow|book)\b/i, 0.5, 'orders'],
  [/\b(net )?profit (rises?|jumps?|surges?|soars?|climbs?|grows?|up|doubles?)\b|\bprofit (rose|jumped|surged|grew)\b/i, 0.7, 'results'],
  [/\b(revenue|sales|income|volumes?) (rises?|jumps?|grows?|up|climbs?|surges?)\b|\brecord (sales|revenue|profit|volumes?)\b/i, 0.5, 'results'],
  [/\bbeats? (estimates?|expectations?|street)\b/i, 0.6, 'results'],
  [/\b(upgrades?|upgraded|raises? target|target (price )?raised|outperform|overweight|initiates? .{0,20}buy|buy rating)\b/i, 0.6, 'rating'],
  [/\brating (upgrade|upgraded)\b|\bupgraded? (to|by) (crisil|icra|care|india ratings|moody|s&p|fitch)/i, 0.5, 'rating'],
  [/\b(buyback|bonus issue|bonus shares|special dividend|dividend)\b/i, 0.35, 'corporate-action'],
  [/\b(acquires?|acquisition of|to acquire|merger|partnership|tie[- ]?up|joint venture|ties up)\b/i, 0.25, 'deal'],
  [/\b(approval|approves?|approved|nod|clearance|licen[cs]e granted|usfda approval)\b/i, 0.35, 'regulatory'],
  [/\b(rall(y|ies)|surges?|soars?|jumps?|zooms?|spurts?|skyrockets?|hits? (fresh )?52[- ]week high|hits? record high|upper circuit)\b/i, 0.45, 'market-move'],
  [/\b(expansion|capacity addition|commissions?|commences? (production|operations)|launches?)\b/i, 0.25, 'guidance'],
  [/\b(raises?|hikes?) (guidance|outlook)\b|\bstrong (demand|outlook|guidance)\b/i, 0.5, 'guidance'],
  [/\b(debt[- ]free|deleverag\w*|turnaround|margins? (expand|improve))/i, 0.35, 'results'],
  [/\b(net )?(loss|losses) (widens?|deepens?)\b|\bposts? (net )?loss\b|\bswings? to (a )?loss\b/i, -0.7, 'results'],
  [/\b(net )?profit (falls?|drops?|declines?|slumps?|plunges?|tanks?|down|halves?|dips?)\b|\bprofit (fell|dropped|declined|slumped)\b/i, -0.7, 'results'],
  [/\b(revenue|sales|volumes?) (falls?|drops?|declines?|slumps?|down|dips?)\b/i, -0.5, 'results'],
  [/\bmiss(es)? (estimates?|expectations?)\b/i, -0.6, 'results'],
  [/\b(downgrades?|downgraded|cuts? target|target (price )?cut|underperform|underweight|sell rating)\b/i, -0.6, 'rating'],
  [/\brating (downgrade|downgraded|cut)\b|\boutlook (to )?negative\b/i, -0.6, 'rating'],
  [/\b(probe|raid|raids|searches|investigation|show[- ]cause|sebi (order|bars?|bans?)|penalty|penali[sz]ed|fined?|fraud|scam|irregularit\w+|forensic audit)\b/i, -0.7, 'regulatory'],
  [/\b(default|defaults|insolvency|bankruptcy|nclt admits|winding up|ibc)\b/i, -0.8, 'legal'],
  [/\b(lawsuit|litigation|arbitration award against|court (order|ruling) against)\b/i, -0.4, 'legal'],
  [/\b(resigns?|resignation|quits?|steps down|exits?)\b/i, -0.35, 'management'],
  [/\b(falls?|slumps?|plunges?|tanks?|crashes?|tumbles?|sinks?|slides?|drops?|declines?|hits? (fresh )?52[- ]week low|lower circuit|sell[- ]off)\b/i, -0.45, 'market-move'],
  [/\b(pledge[ds]?|invok\w+ pledge|stake sale|offer for sale|block deal|promoter sells?|selling pressure)\b/i, -0.25, 'deal'],
  [/\b(weak (demand|outlook|guidance|quarter)|cuts? (guidance|outlook)|slowdown|headwinds?|margin pressure)\b/i, -0.5, 'guidance'],
  [/\b(recall|shutdown|strike|fire at|explosion|accident|outage|cyber ?attack|data breach)\b/i, -0.5, 'other'],
];
/** NSE filing categories that carry direction on their own. Neutral categories are omitted. */
const CATEGORIES: [RegExp, number, EventType][] = [
  [/bagging|receiving of orders|contracts/i, 0.6, 'orders'],
  [/commencement of commercial production|operations/i, 0.4, 'guidance'],
  [/buy ?back/i, 0.4, 'corporate-action'],
  [/bonus/i, 0.35, 'corporate-action'],
  [/acquisition|amalgamation|scheme of arrangement/i, 0.15, 'deal'],
  [/pendency of litigation|litigation|dispute/i, -0.4, 'legal'],
  [/action\(s\) (taken|initiated)|orders passed|penalty|fine/i, -0.45, 'regulatory'],
  [/default|insolvency|corporate insolvency|fraud/i, -0.8, 'legal'],
  [/resignation|cessation/i, -0.3, 'management'],
  [/credit rating/i, 0, 'rating'],
  [/financial results|outcome of board meeting/i, 0, 'results'],
  [/spurt in volume|news verification|clarification/i, 0, 'other'],
];
export interface Score { score: number; label: 'positive' | 'neutral' | 'negative'; confidence: number; eventType: EventType; reason: string }
export const labelOf = (score: number): Score['label'] => score >= 0.2 ? 'positive' : score <= -0.2 ? 'negative' : 'neutral';

export function lexiconScore(title: string, summary = '', category?: string): Score {
  let total = 0, hits = 0, event: EventType | undefined, strongest = 0, why = '';
  const consider = (weight: number, type: EventType | undefined, label: string) => {
    total += weight; hits++;
    if (Math.abs(weight) > Math.abs(strongest)) { strongest = weight; event = type; why = label; }
  };
  if (category) for (const [pattern, weight, type] of CATEGORIES) if (pattern.test(category)) { consider(weight, type, `Filing: ${category}`); break; }
  // Headlines decide direction; summaries only add half weight and cannot add a new direction alone.
  for (const [pattern, weight, type] of PHRASES) {
    const inTitle = pattern.exec(title);
    if (inTitle) consider(weight, type, `“${inTitle[0]}”`);
    else { const inSummary = pattern.exec(summary); if (inSummary) consider(weight * 0.5, type, `“${inSummary[0]}”`); }
  }
  const score = Math.round(Math.tanh(total) * 100) / 100;
  return { score, label: labelOf(score), confidence: hits ? Math.min(0.6, 0.3 + 0.1 * hits) : 0.2, eventType: event ?? (category ? 'other' : /sensex|nifty|market/i.test(title) ? 'macro' : 'other'),
    reason: hits ? `Keyword match: ${why}` : 'No directional keywords' };
}
