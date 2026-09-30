import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { useStockResource } from '../hooks/useStockResource';
import { stockMoney,stockTime } from '../utils/format';
interface Level{price:number;quantity:number;orders:number|null}
export interface DepthResponse {depth:null|{bids:Level[];asks:Level[];totalBuy:number|null;totalSell:number|null;receivedAt:string;source:string};session:{open:boolean;nextOpenAt:string|null;closesAt:string;reason:string};message?:string}
function refreshDepth(data:DepthResponse|undefined){const s=data?.session;return !s||s.open&&Date.now()<Date.parse(s.closesAt)||!!s.nextOpenAt&&Date.now()>=Date.parse(s.nextOpenAt);}
export function StockMarketDepth({instrumentId,now}:{instrumentId:string;now:number}){
  // The server owns the holiday calendar. Wake at the next known session, not on closed-day intervals.
  const state=useStockResource<DepthResponse>(`/stocks/${encodeURIComponent(instrumentId)}/depth`,15000,refreshDepth);
  const depth=state.data?.depth,session=state.data?.session;
  const total=depth?.totalBuy!=null&&depth.totalSell!=null?depth.totalBuy+depth.totalSell:null;
  const buy=total?depth!.totalBuy!/total*100:null;
  const stale=depth&&now-Date.parse(depth.receivedAt)>45000;
  return <section aria-label="Market depth"><div className="stock-section-heading"><h3>Market depth <Tag>5 levels</Tag></h3><Button size="small" onClick={state.retry} loading={state.loading}>Refresh depth</Button></div>
    {(state.error||state.data?.message)&&<Alert type="warning" showIcon title="Depth could not be refreshed" description={state.error||state.data?.message}/>}
    {state.loading&&!state.data?<Skeleton active/>:!depth?<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Market depth is not available from the provider."/>:<>
      <div className="depth-ratio-labels"><span>Pending buy quantity <strong className="positive">{buy===null?'—':`${buy.toFixed(1)}%`}</strong></span><span>Pending sell quantity <strong className="negative">{buy===null?'—':`${(100-buy).toFixed(1)}%`}</strong></span></div>
      <div className="depth-ratio" aria-label="Pending quantity balance">{buy!==null&&<i style={{width:`${buy}%`}}/>}</div>
      <div className="depth-books">{([['Bids',depth.bids,depth.totalBuy],['Asks',depth.asks,depth.totalSell]] as const).map(([name,rows,sum])=>{const max=Math.max(1,...rows.map(r=>r.quantity));return <div key={name}><table className="research-table"><thead><tr><th>{name} · price</th><th>Qty</th></tr></thead><tbody>{Array.from({length:5},(_,i)=>{const r=rows[i];return <tr key={i}><td>{stockMoney(r?.price)}</td><td className={name==='Bids'?'positive':'negative'}><span className="depth-quantity" style={{backgroundSize:`${r?r.quantity/max*100:0}% 100%`}}>{r?.quantity.toLocaleString('en-IN')??'—'}</span></td></tr>;})}</tbody><tfoot><tr><th>Total pending</th><td>{sum?.toLocaleString('en-IN')??'—'}</td></tr></tfoot></table></div>;})}</div>
      {!depth.bids.length&&!depth.asks.length&&<p className="muted">No price levels were reported in this snapshot.</p>}
      <p className="stock-chart-note">{stale?'Last saved snapshot':'Snapshot'} · {stockTime(depth.receivedAt)} · {depth.source}. {session?.open?'Checks about every 15 seconds while this view is open.':session?.reason} Totals cover all reported pending orders, not just these five levels. This is not executed buy/sell volume.</p>
    </>}
  </section>;
}
