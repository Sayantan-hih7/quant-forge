import type {LiveBook,LiveQuote} from '../../market-feed/types/feed.types.js';
import type {PaperOrder} from '../models/paper.model.js';
/** Fresh best-bid packets only. Old depth refreshed by circuit/ask packets is not executable. */
export function protectiveBookQuote(order:Pick<PaperOrder,'side'|'source'|'targetIndex'|'createdAt'|'eligibleAfter'>,quote:LiveQuote,book:LiveBook,now:number){
 const at=Date.parse(book.bestBidAt??''),created=Date.parse(order.createdAt),eligible=Date.parse(order.eligibleAfter);
 const bid=book.bids?.[0];
 if(order.side!=='SELL'||order.source!=='protection'||order.targetIndex!==undefined||!Number.isFinite(created)||now-created<5000)return null;
 if(book.session!==quote.session||book.source!==quote.source||book.instrumentId!==quote.instrumentId)return null;
 if(!Number.isFinite(at)||!Number.isFinite(eligible)||at<=eligible||now-at<0||now-at>5000)return null;
 if(!bid||!Number.isFinite(bid.price)||bid.price<=0||!Number.isSafeInteger(bid.quantity)||bid.quantity<1)return null;
 // Unknown circuit limits cannot establish that a thin bid is executable.
 if(!(book.lowerCircuit&&book.lowerCircuit>0)||bid.price<=book.lowerCircuit)return null;
 return {...quote,price:bid.price,at:new Date(at).toISOString(),receivedAt:book.receivedAt,details:{...quote.details,lowerCircuit:book.lowerCircuit,upperCircuit:book.upperCircuit}};
}
