import type {LiveQuote} from '../../market-feed/types/feed.types.js';
import type {PaperPosition} from '../models/paper.model.js';
import type {Risk} from '../../strategies/validations/strategy.validation.js';
export function protectiveTrigger(position:PaperPosition,risk:Risk,quotes:LiveQuote[],sessionExit:boolean){
  let stop=position.stopPaise;
  for(const quote of quotes){
    if(quote.instrumentId!==position.instrumentId || quote.at<position.openedAt)continue;
    const price=Math.round(quote.price*100);
    const reason=price<=stop?'Stop loss':price>=position.targetPaise?'Target':sessionExit?'Session close':undefined;
    if(reason)return{quote,reason,stop};
    if(risk.stopMode==='trailing')stop=Math.max(stop,Math.round(price*(1-risk.stopPercent/100)));
  }
  return{stop};
}
