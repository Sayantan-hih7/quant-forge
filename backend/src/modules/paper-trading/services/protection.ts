import type {LiveQuote} from '../../market-feed/types/feed.types.js';
import type {PaperPosition} from '../models/paper.model.js';
import type {Risk} from '../../strategies/validations/strategy.validation.js';
import { nextTarget } from './exit-targets.js';
import { advanceStop } from './stop-management.js';
export function protectiveTrigger(position:PaperPosition,risk:Risk,quotes:LiveQuote[],sessionExit:boolean){
  let state={...position};
  for(const quote of quotes){
    if(quote.instrumentId!==position.instrumentId || quote.at<position.openedAt || (state.lastProtectionAt && quote.at<state.lastProtectionAt))continue;
    const price=Math.round(quote.price*100);
    const index=nextTarget(position), target=index>=0?position.targets![index]:undefined;
    const forced=price<=state.stopPaise?'Stop loss':sessionExit?'Session close':undefined;
    state.lastProtectionAt=quote.at;
    if(forced)return{quote,reason:forced,stop:state.stopPaise,state,targetIndex:undefined};
    state={...state,...advanceStop(state,risk,price)};
    const reason=price>=(target?.pricePaise??position.targetPaise)?target?`Target ${index+1}`:'Target':undefined;
    if(reason)return{quote,reason,stop:state.stopPaise,state,targetIndex:reason.startsWith('Target ') ? index : undefined};
  }
  return{stop:state.stopPaise,state};
}
