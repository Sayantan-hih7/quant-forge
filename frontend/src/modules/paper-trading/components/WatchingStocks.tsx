import {describeCondition} from '../../qualification/config/metrics';
import {watchingStocks} from '../utils/watchingStocks';
import {useState} from 'react';
import {Input,Select,Space,Table,Tag} from 'antd';
import type {PaperData,PaperObservation,PaperSession} from '../hooks/useBackendPaper';
import {StockChartButton} from '../../stock-details/components/StockChartButton';
import {fieldLabel} from '../../qualification/config/ruleFields';

function checks(o:PaperObservation|undefined,s:PaperSession){return <div><p>{s.message??'Waiting for a completed candle.'}</p>{!o?<p>No rule evaluation yet. This stock stays visible while monitoring starts.</p>:(['entry','exit'] as const).map(side=><div key={side}><strong>{side==='entry'?'Buy rules':'Sell rules'}</strong><p>{s.strategy[side].groups.map(g=>g.conditions.map(describeCondition).join(` ${g.logic} `)).join(' | ')}</p>{side==='exit'&&o.exit.disabled?<p>Indicator exits are disabled; stops, targets and session exits still apply to held shares.</p>:o[side].checks.map((c,i)=><div key={i}><Tag color={c.matched===null?'gold':c.matched?'green':'default'}>{c.matched===null?'Needs data':c.matched?'Met':'Not met'}</Tag>{fieldLabel(c.missingField??c.field)}{c.left!=null?` | observed ${c.left.toFixed(2)}`:''}{c.right!=null?` | comparison ${c.right.toFixed(2)}`:''}{c.reason?` | ${c.reason}`:''}</div>)}</div>)}<p className="muted">These are the latest completed-candle checks, not tick-by-tick predictions. A match is not a guaranteed fill.</p></div>;}
export function WatchingStocks({data,sessionId,onChart}:{data:PaperData;sessionId?:string;onChart:(sessionId:string,instrumentId:string)=>void}){
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),rows=watchingStocks(data,sessionId);
 return <section aria-label="Stocks being monitored"><Space wrap style={{marginBottom:12}}><Input.Search aria-label="Search monitored stocks" placeholder="Search stock" value={search} onChange={e=>setSearch(e.target.value)}/><Select aria-label="Filter monitoring status" value={filter} onChange={setFilter} options={[{value:'all',label:`All monitored (${rows.length})`},{value:'waiting',label:'Waiting / holding'},{value:'blocked',label:'Needs attention'},{value:'order',label:'Order queued'},{value:'closed',label:'Market closed'}]}/></Space><Table rowKey="key" size="small" scroll={{x:800}} pagination={{defaultPageSize:10,showSizeChanger:true}} dataSource={rows.filter(r=>(filter==='all'||r.kind===filter)&&r.symbol.toLowerCase().includes(search.toLowerCase()))} locale={{emptyText:'No stocks in this monitoring selection.'}} columns={[
 {title:'Stock',render:(_,r)=><StockChartButton symbol={r.symbol} onClick={()=>onChart(r.session._id,r.instrumentId)}/>},
 {title:'Strategy',render:(_,r)=><>{r.session.strategy.name}<div className="muted">Revision {r.session.strategy.revision}</div></>},
 {title:'Current activity',render:(_,r)=><><Tag color={r.kind==='blocked'?'gold':r.kind==='order'?'blue':'default'}>{r.status}</Tag>{r.order&&<div>{r.order.message??r.order.reason}</div>}</>},
 {title:'Latest buy check',render:(_,r)=>r.observation?(r.observation.entry.matched===null?'Needs data':r.observation.entry.matched?'Conditions met':`${r.observation.entry.checks.filter(c=>c.matched).length}/${r.observation.entry.checks.length} checks met`):'Not checked yet'},
 {title:'Candle checked (IST)',render:(_,r)=>r.observation?.barEnd?new Date(r.observation.barEnd).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'Waiting'},
 ]} expandable={{expandedRowRender:r=>checks(r.observation,r.session)}}/></section>;
}
