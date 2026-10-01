import { useCallback, useEffect, useRef } from 'react';
import { Alert, Button, Empty, Skeleton, Tag, Tooltip } from 'antd';
import { useStockResource } from '../hooks/useStockResource';
import { stockMoney,stockTime } from '../utils/format';
import type { DepthLevel, StockDepth, StockQuote } from '../types';
import { Flash } from './Flash';
export interface DepthResponse {depth:null|StockDepth;liveDepth?:null|StockDepth;session:{open:boolean;nextOpenAt:string|null;closesAt:string;reason:string};message?:string}
/** A streamed book counts as live while it keeps arriving; otherwise snapshots carry the view. */
const LIVE_MS=10_000;
const newest=(...rows:(StockDepth|null|undefined)[])=>rows.filter((x):x is StockDepth=>!!x).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt))[0];
const levelsOf=(book:StockDepth)=>book.levels??Math.max(book.bids.length,book.asks.length);
function refreshDepth(data:DepthResponse|undefined){const s=data?.session;return !s||s.open&&Date.now()<Date.parse(s.closesAt)||!!s.nextOpenAt&&Date.now()>=Date.parse(s.nextOpenAt);}
type Row=DepthLevel&{live?:boolean};
/** Live best price first, then snapshot levels that are still behind it (crossed snapshot levels are stale). */
function side(live:DepthLevel|undefined,snapshot:DepthLevel[]|undefined,behind:(price:number,best:number)=>boolean):Row[]{
  if(!live)return snapshot??[];
  return [{...live,live:true},...(snapshot??[]).filter(level=>behind(level.price,live.price))].slice(0,5);
}
export function StockMarketDepth({instrumentId,now,quote}:{instrumentId:string;now:number;quote?:StockQuote}){
  const streamedAt=quote?.liveDepth?.receivedAt, streamedLevels=quote?.liveDepth?levelsOf(quote.liveDepth):0;
  const fullStream=useRef(false);
  useEffect(()=>{ fullStream.current=!!streamedAt&&streamedLevels>=5&&Date.now()-Date.parse(streamedAt)<LIVE_MS; },[streamedAt,streamedLevels]);
  // The server owns the holiday calendar. Poll snapshots every 3 s in session, unless the stream already carries all five levels.
  const shouldRefresh=useCallback((data:DepthResponse|undefined)=>!fullStream.current&&refreshDepth(data),[]);
  const state=useStockResource<DepthResponse>(`/stocks/${encodeURIComponent(instrumentId)}/depth`,3000,shouldRefresh);
  const session=state.data?.session;
  const snapshot=newest(state.data?.depth,quote?.depth);
  const stream=newest(state.data?.liveDepth,quote?.liveDepth);
  const live=!!stream&&now-Date.parse(stream.receivedAt)<LIVE_MS;
  const full=live&&levelsOf(stream!)>=5;
  const bids:Row[]=full?stream!.bids.map(l=>({...l,live:true})):side(live?stream!.bids[0]:undefined,snapshot?.bids,(price,best)=>price<best);
  const asks:Row[]=full?stream!.asks.map(l=>({...l,live:true})):side(live?stream!.asks[0]:undefined,snapshot?.asks,(price,best)=>price>best);
  const hasBook=bids.length+asks.length>0;
  // A full live book (Dhan Full mode) carries current whole-book totals; otherwise use the snapshot's.
  const totals=full&&stream!.totalBuy!=null&&stream!.totalSell!=null?stream!:snapshot;
  const totalBuy=totals?.totalBuy??null, totalSell=totals?.totalSell??null;
  const sum=(rows:Row[])=>rows.reduce((s,r)=>s+r.quantity,0);
  // Snapshot totals cover every pending order; without them the balance covers only the visible levels.
  const buyQty=totalBuy!=null&&totalSell!=null?totalBuy:sum(bids), sellQty=totalBuy!=null&&totalSell!=null?totalSell:sum(asks);
  const allOrders=totalBuy!=null&&totalSell!=null;
  const buy=buyQty+sellQty>0?buyQty/(buyQty+sellQty)*100:null;
  const stale=snapshot&&now-Date.parse(snapshot.receivedAt)>45000;
  const note=full?`Live order book · ${stream!.source} · ${stockTime(stream!.receivedAt)}.`
    :live&&snapshot?`Best bid/offer live from ${stream!.source} (marked •). Deeper levels from ${snapshot.source} · ${stockTime(snapshot.receivedAt)}${session?.open?', refreshed about every 3 seconds':''}; ${stream!.source} provides ${levelsOf(stream!)===1?'only the best level':`${levelsOf(stream!)} levels`}.`
    :live?`Live best bid/offer · ${stream!.source} · ${stockTime(stream!.receivedAt)}. A five-level snapshot has not been received yet.`
    :snapshot?`${stale?'Last saved snapshot':'Snapshot'} · ${stockTime(snapshot.receivedAt)} · ${snapshot.source}. ${session?.open?'Refreshes about every 3 seconds while this view is open.':session?.reason??''}`:'';
  return <section aria-label="Market depth"><div className="stock-section-heading"><h3>Market depth <Tag>5 levels</Tag>{live&&<Tooltip title={full?'All five levels stream live.':'The best bid and offer stream live; deeper levels are recent snapshots.'}><Tag color="green" className="depth-live-tag"><i/>{full?'Live':'Live best price'}</Tag></Tooltip>}</h3><Button size="small" onClick={state.retry} loading={state.loading}>Refresh depth</Button></div>
    {!live&&(state.error||state.data?.message)&&<Alert type="warning" showIcon title="Depth could not be refreshed" description={state.error||state.data?.message}/>}
    {state.loading&&!state.data&&!hasBook?<Skeleton active/>:!hasBook?<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Market depth is not available from the provider."/>:<>
      <div className="depth-ratio-labels"><span>{allOrders?'Pending buy quantity':'Buy quantity (shown levels)'} <strong className="positive">{buy===null?'—':`${buy.toFixed(1)}%`}</strong></span><span>{allOrders?'Pending sell quantity':'Sell quantity (shown levels)'} <strong className="negative">{buy===null?'—':`${(100-buy).toFixed(1)}%`}</strong></span></div>
      <div className="depth-ratio" aria-label="Pending quantity balance">{buy!==null&&<i style={{width:`${buy}%`}}/>}</div>
      <div className="depth-books">{([['Bids',bids,totalBuy],['Asks',asks,totalSell]] as const).map(([name,rows,total])=>{const max=Math.max(1,...rows.map(r=>r.quantity));return <div key={name}><table className="research-table"><thead><tr><th>{name} · price</th><th>Qty</th></tr></thead><tbody>{Array.from({length:5},(_,i)=>{const r=rows[i];return <tr key={i} className={r?.live?'depth-row-live':undefined}><td><Flash value={r?.price}>{r?.live&&<i className="depth-live-dot" aria-label="Live"/>}{stockMoney(r?.price)}</Flash></td><td className={name==='Bids'?'positive':'negative'}><Flash value={r?.quantity} className="depth-flash"><span className="depth-quantity" style={{backgroundSize:`${r?r.quantity/max*100:0}% 100%`}}>{r?.quantity.toLocaleString('en-IN')??'—'}</span></Flash></td></tr>;})}</tbody><tfoot><tr><th>{total!=null?'Total pending':'Total (shown levels)'}</th><td>{(total??sum(rows)).toLocaleString('en-IN')}</td></tr></tfoot></table></div>;})}</div>
      <p className="stock-chart-note">{note} {allOrders?'Totals cover all reported pending orders, not just these five levels. ':''}This is not executed buy/sell volume.</p>
    </>}
  </section>;
}
