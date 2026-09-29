import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import { Button, Space, Table, Tag, Tooltip } from 'antd';
import { StockChartButton } from '../../stock-details/components/StockChartButton';
import { fieldLabel } from '../../qualification/config/ruleFields';
import type { PaperData, PaperSignal } from '../hooks/useBackendPaper';
const money=(paise?:number)=>paise==null?'—':`₹${(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export function SignalTable({data,sessionId,onConfirm,onSettings,onChart}:{data:PaperData;sessionId?:string;onConfirm:(id:string)=>void;onSettings:(id:string)=>void;onChart?:(signal:PaperSignal)=>void}){
 const signals=data.signals.filter(s=>!sessionId||s.sessionId===sessionId);
 return <Table<PaperSignal> rowKey="_id" dataSource={signals} size="small" pagination={{pageSize:10}} scroll={{x:1050}} locale={{emptyText:'No rule matches recorded yet. See monitoring status and latest checks below.'}} columns={[
  {title:'Stock',render:(_,s)=>onChart?<StockChartButton symbol={data.symbols?.[s.instrumentId]??s.instrumentId} onClick={()=>onChart(s)}/>:<strong>{data.symbols?.[s.instrumentId]??s.instrumentId}</strong>},
  {title:'Strategy',render:(_,s)=>{const session=data.sessions.find(r=>r._id===s.sessionId);return <>{session?.strategy.name??'Earlier strategy'}{session&&<div><StrategyHistoryButton strategy={session.strategy} context="This signal" /></div>}{session&&!session.active&&<div className="muted">Previous session · revision {session.strategy.revision}</div>}</>; }},
  {title:'Signal',render:(_,s)=><Tag color={s.side==='BUY'?'green':'red'}>{s.side}</Tag>},
  {title:'Candle close',render:(_,s)=>new Date(s.barEnd).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})},
  {title:'Signal price',render:(_,s)=>money(s.referencePrice==null?undefined:s.referencePrice*100)},
  {title:'Shares / SL / target',render:(_,s)=>{const order=data.orders.find(o=>o._id===s.orderId),e=order?.estimate;return e?.quantity?<Tooltip title={e.message}><span>{e.quantity} est. shares<div className="muted">SL {money(e.stopPaise)} · Target {money(e.targetPaise)}</div></span></Tooltip>:order?.status==='filled'?`${order.quantity} filled`:e?.message?<Tooltip title={e.message}>Waiting for sizing</Tooltip>:'—';}},
  {title:'Status',render:(_,s)=>{const o=data.orders.find(o=>o._id===s.orderId);const expired=s.expiresAt&&Date.parse(s.expiresAt)<=Date.now();const status=o?.status??(expired?'expired':'Signal only');return <Tag color={status==='confirmation'?'gold':status==='filled'?'green':'default'}>{status==='confirmation'?'Awaiting your approval':status}</Tag>;}},
  {title:'Action',render:(_,s)=>{const o=data.orders.find(o=>o._id===s.orderId),session=data.sessions.find(r=>r._id===s.sessionId);return o?.status==='confirmation'&&(!o.expiresAt||Date.parse(o.expiresAt)>Date.now())?<Button size="small" disabled={!data.feed?.freshIds.includes(s.instrumentId)||data.marketOpen===false} onClick={()=>onConfirm(o._id)}>Confirm paper trade</Button>:session?.active&&session.mode==='signals'?<Button size="small" onClick={()=>onSettings(s.sessionId)}>Enable paper trading</Button>:null;}},
 ]} expandable={{expandedRowRender:s=><><p>{s.message??'Rules matched on this completed candle. This record is not a guarantee of an executable trade.'}</p><Space orientation="vertical">{s.checks?.map((c,i)=><div key={i}><Tag color={c.matched===true?'green':c.matched===null?'gold':'default'}>{c.matched===true?'Met':c.matched===null?'Missing':'Not met'}</Tag>{fieldLabel(c.missingField??c.field)} {c.left!=null?c.left.toFixed(2):''}{c.right!=null?` / ${c.right.toFixed(2)}`:''} {c.reason}</div>)}</Space></>}}/>;
}
