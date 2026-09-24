import type { LiveQuote } from '../types/feed.types.js';
import type { Candle } from '../../market-data/types.js';
interface Bucket { start:number; open:number; high:number; low:number; close:number; volume:number; valid:boolean; last:number }
interface Tracking { quote:LiveQuote; bucket?:Bucket }
/** Consume every tick before quote coalescing. Unknown opening volume, stream
 * gaps and reconnect fragments are discarded; history imports can backfill. */
export class CandleBuilder {
  private tracking=new Map<string,Tracking>();
  private ready:Candle[]=[];
  reset(){this.tracking.clear();}
  tick(quote:LiveQuote){
    const time=Date.parse(quote.at), start=Math.floor(time/60000)*60000;
    const previous=this.tracking.get(quote.instrumentId);
    if(previous && time<Date.parse(previous.quote.at))return;
    if(previous?.bucket && previous.bucket.start!==start){this.close(quote.instrumentId,previous);previous.bucket=undefined;}
    const local=new Date(time+19800000), minute=local.getUTCHours()*60+local.getUTCMinutes();
    if(minute<555 || minute>=930 || quote.cumulativeVolume===null){this.tracking.set(quote.instrumentId,{quote});return;}
    const gap=previous?time-Date.parse(previous.quote.at):Infinity;
    const delta=previous?.quote.cumulativeVolume===null || !previous?NaN:quote.cumulativeVolume-previous.quote.cumulativeVolume;
    const valid=gap<=15000 && gap>=0 && Number.isFinite(delta) && delta>=0 && previous?.quote.session===quote.session;
    const b=previous?.bucket??{start,open:quote.price,high:quote.price,low:quote.price,close:quote.price,volume:0,valid:!!valid && start-Date.parse(previous!.quote.at)<=15000,last:time};
    b.high=Math.max(b.high,quote.price);b.low=Math.min(b.low,quote.price);b.close=quote.price;b.last=time;
    b.valid=b.valid && !!valid; b.volume+=Number.isFinite(delta)&&delta>=0?delta:0;
    this.tracking.set(quote.instrumentId,{quote,bucket:b});
  }
  private close(id:string,state:Tracking){
    const b=state.bucket;if(!b)return;
    if(b.valid && b.start+60000-b.last<=15000)this.ready.push({instrumentId:id,interval:'1m',time:new Date(b.start).toISOString(),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,source:'motilal',observedAt:new Date().toISOString()});
  }
  drain(now=Date.now()){
    for(const [id,state]of this.tracking)if(state.bucket && state.bucket.start+62000<=now){this.close(id,state);state.bucket=undefined;}
    const bars=this.ready;this.ready=[];return bars;
  }
}
