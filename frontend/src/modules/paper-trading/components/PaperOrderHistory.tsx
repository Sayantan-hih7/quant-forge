import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Descriptions,Segmented,Space,Table,Tag,Tooltip} from 'antd';
import {StockChartButton} from '../../stock-details/components/StockChartButton';
import {apiClient} from '../../../services/apiClient';
import type {PaperOrder,PaperSession} from '../hooks/useBackendPaper';
const money=(p?:number|null)=>p==null?'—':`₹${(p/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const time=(v?:string)=>v?new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—';
interface History {items:PaperOrder[];symbols:Record<string,string>;hasMore:boolean;next:{beforeAt:string;beforeId:string}|null;summary?:{buys:number;exits:number;feesPaise:number;realizedPnlPaise:number|null;missing:number}}
interface Props {sessionId?:string;sessions:PaperSession[];onChart?:(order:PaperOrder,symbol:string)=>void}
export function PaperOrderHistory(props:Props){
 const [view,setView]=useState('exits');
 return <><Segmented aria-label="History view" className="mb-5" value={view} onChange={setView} options={[{value:'exits',label:'Trades · realized P&L'},{value:'orders',label:'All orders'}]}/><HistoryTable key={`${props.sessionId??'all'}:${view}`} {...props} exitsOnly={view==='exits'}/></>;
}
function HistoryTable({sessionId,sessions,onChart,exitsOnly}:Props&{exitsOnly:boolean}){
 const [data,setData]=useState<History>(),[error,setError]=useState<string>(),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[pages,setPages]=useState(1);
 const request=useRef(0);
 useEffect(()=>{
  const controller=new AbortController();let running=false;
  async function load(){
   if(running)return;running=true;const version=++request.current;
   try{
    let result:History|undefined,cursor:History['next']=null;
    for(let page=0;page<pages;page++){
     const next:History=(await apiClient.get<History>('/paper/orders',{params:{sessionId,exitsOnly,...cursor},signal:controller.signal})).data;
     result=result?{...next,items:[...result.items,...next.items],symbols:{...result.symbols,...next.symbols}}:next;
     cursor=next.next;if(!cursor)break;
    }
    if(!controller.signal.aborted&&request.current===version){setData(result);setError(undefined);}
   }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{running=false;if(!controller.signal.aborted)setBusy(false);}
  }
  void load();const timer=setInterval(()=>void load(),5000);return()=>{controller.abort();clearInterval(timer);};
 },[sessionId,exitsOnly,pages,reload]);
 return <><Space wrap className="mb-5"><Button loading={busy} onClick={()=>{setBusy(true);setReload(r=>r+1);}}>Refresh history</Button><span className="muted">Updates every 5 seconds · Times in IST</span></Space>
 {data?.summary&&<div className="mb-5"><Space wrap size="large"><span>Realized P&L <strong className={(data.summary.realizedPnlPaise??0)<0?'negative':'positive'}>{money(data.summary.realizedPnlPaise)}</strong></span><span>Total fees <strong>{money(data.summary.feesPaise)}</strong></span><span>{data.summary.buys} buy fills · {data.summary.exits} exit fills</span></Space><p className="muted">Totals cover all history for your strategy filter, including earlier pages. Each partial exit has its own net P&L; entry costs are split across the shares sold.</p>{!!data.summary.missing&&<Alert type="warning" title={`${data.summary.missing} older exits lack a complete cost record. Total realized P&L is unavailable.`}/>}</div>}
 {error&&<Alert type="error" title={error}/>}
 <Table<PaperOrder> rowKey="_id" size="small" dataSource={data?.items??[]} pagination={false} loading={!data&&!error} scroll={{x:exitsOnly?1250:1400}} locale={{emptyText:exitsOnly?'No shares have been sold yet. Open positions show unrealized P&L above.':'No paper orders yet.'}} columns={[
  {title:'Stock',render:(_,o)=>onChart?<StockChartButton symbol={data?.symbols[o.instrumentId]??o.instrumentId} onClick={()=>onChart(o,data?.symbols[o.instrumentId]??o.instrumentId)}/>:data?.symbols[o.instrumentId]??o.instrumentId},
  {title:'Strategy',render:(_,o)=>{const session=sessions.find(s=>s._id===o.sessionId);return session?<>{session.strategy.name}<div><StrategyHistoryButton strategy={session.strategy} context="This paper trade / order" /></div></>:'Earlier strategy';}},
  ...(!exitsOnly?[{title:'Side',render:(_:unknown,o:PaperOrder)=><Tag color={o.side==='BUY'?'green':'red'}>{o.side}</Tag>}]:[]),
  {title:'Shares',render:(_,o)=>o.quantity||(o.side==='SELL'?'All remaining':'Auto-size')},
  {title:'Entry price',render:(_,o)=>money(o.entryPaise??(o.side==='BUY'?o.fillPaise:undefined))},
  {title:exitsOnly?'Exit price':'Fill price',render:(_,o)=>money(o.fillPaise)},
  {title:'Fees',render:(_,o)=><Tooltip title={o.side==='SELL'&&o.entryFeePaise!==undefined?`Entry allocation ${money(o.entryFeePaise)} + exit ${money(o.feePaise)}`:'Fee for this order'}>{o.side==='SELL'&&o.entryFeePaise!==undefined?money(o.entryFeePaise+(o.feePaise??0)):money(o.feePaise)}</Tooltip>},
  {title:'Net P&L',render:(_,o)=>o.realizedPnlPaise!==undefined?<strong className={o.realizedPnlPaise<0?'negative':'positive'}>{money(o.realizedPnlPaise)}{o.allocatedCostPaise!==undefined&&o.allocatedCostPaise>0&&<div style={{fontSize:11}}>{(o.realizedPnlPaise/o.allocatedCostPaise*100).toFixed(2)}%</div>}</strong>:<Tooltip title={o.side==='BUY'?'Buy fills do not realize profit or loss. Check open P&L until shares are sold.':o.status==='filled'?'The original entry cost is unavailable.':'An unfilled order has no realized P&L.'}>—</Tooltip>},
  ...(!exitsOnly?[{title:'Status',render:(_:unknown,o:PaperOrder)=><Tag color={o.status==='filled'?'green':'default'}>{o.status}</Tag>}]:[]),
  {title:exitsOnly?'Exit time (IST)':'Time (IST)',render:(_,o)=>time(o.filledAt??o.createdAt)},
  {title:'Reason',render:(_,o)=>o.reason==='Session close'?'Intraday square-off':o.message??o.reason},
 ]} expandable={{expandedRowRender:o=><Descriptions size="small" column={2} items={[
  {key:'id',label:'Order ID',children:o._id},{key:'source',label:'Source',children:o.source},
  {key:'type',label:'Order type',children:o.limitPaise!==undefined?`Limit ${money(o.limitPaise)}`:'Market'},
  {key:'entry',label:'Position opened (IST)',children:time(o.positionOpenedAt)},
  {key:'created',label:'Order placed (IST)',children:time(o.createdAt)},{key:'filled',label:'Filled (IST)',children:time(o.filledAt)},
  {key:'fees',label:'Order fee',children:money(o.feePaise)},{key:'cost',label:'Entry cost incl. fees',children:money(o.allocatedCostPaise)},
  {key:'expiry',label:'Expiry (IST)',children:time(o.expiresAt)},{key:'changes',label:'Price changes',children:o.amendments?.map((a,i)=><div key={i}>{time(a.at)} · {a.orderType==='limit'?money(a.limitPaise):'Market'}</div>)??'None'},
 ]}/>}}/>
 {data?.hasMore&&<Button className="mt-5" loading={busy} onClick={()=>{setBusy(true);setPages(p=>p+1);}}>Load earlier {exitsOnly?'trades':'orders'}</Button>}</>;
}
