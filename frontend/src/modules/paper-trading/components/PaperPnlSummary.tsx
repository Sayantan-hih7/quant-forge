import {Card,Statistic} from 'antd';
import type {PaperPosition,PaperSession} from '../hooks/useBackendPaper';

export function PaperPnlSummary({sessions,positions}:{sessions:PaperSession[];positions:PaperPosition[]}){
 const booked=sessions.every(s=>s.bookedPnlPaise!==undefined)?sessions.reduce((sum,s)=>sum+s.bookedPnlPaise!,0):undefined;
 const open=positions.every(p=>p.mark!==undefined)?positions.reduce((sum,p)=>sum+p.mark!.unrealizedPaise,0):undefined;
 const total=booked!==undefined&&open!==undefined?booked+open:undefined;
 const stale=positions.filter(p=>p.mark&&!p.mark.fresh).length,missing=positions.filter(p=>!p.mark).length;
 return <div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
  {[['Realized P&L',booked,'Sold shares · after entry and exit fees'],['Open P&L',open,'Remaining shares · before exit fees'],['Total P&L',total,'Realized + open P&L']] .map(([title,value,help])=><Card size="small" key={String(title)}><Statistic title={title} value={typeof value==='number'?value/100:'—'} precision={2} prefix={value===undefined?undefined:'₹'} styles={{content:{color:typeof value==='number'?(value<0?'var(--color-negative, #d4380d)':'var(--color-positive, #00866a)'):undefined}}}/><div className="muted mt-2">{help}</div></Card>)}
 </div><p className="muted mt-3">Totals include active and stopped accounts in your strategy filter.{missing?` ${missing} open position(s) have no quote, so open and total P&L are unavailable.`:''}{stale?` ${stale} position(s) use the last received price; open P&L is not live.`:''}</p></div>;
}
