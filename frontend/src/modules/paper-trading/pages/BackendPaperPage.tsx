import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import {useBackendStrategies} from '../../strategies/hooks/useBackendStrategies';
import {useEffect,useState} from 'react';
import {Alert,App,Button,Card,Descriptions,Drawer,Empty,Select,Space,Table,Tabs,Tag} from 'antd';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {useBackendPaper,type PaperOrder,type PaperPosition} from '../hooks/useBackendPaper';
import {PaperPositionTargets} from '../components/PaperPositionTargets';
import {ManualPaperOrder} from '../components/ManualPaperOrder';
import {PaperOrderHistory} from '../components/PaperOrderHistory';
import {PaperPnlSummary} from '../components/PaperPnlSummary';
import {PositionExitActions} from '../components/PositionExitActions';
import {ModifyPaperOrder} from '../components/ModifyPaperOrder';
import {MonitoringSettings} from '../components/MonitoringSettings';
import {PaperStockChart,type PaperChartSelection} from '../components/PaperStockChart';
import {StockChartButton} from '../../stock-details/components/StockChartButton';
import {apiClient} from '../../../services/apiClient';
const money=(p?:number)=>p==null?'—':`₹${(p/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export default function BackendPaperPage(){
 const {data,error,refresh}=useBackendPaper(),{message}=App.useApp(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const [manual,setManual]=useState<{sessionId:string;instrumentId?:string;side?:'BUY'|'SELL';quantity?:number}>(),[editing,setEditing]=useState<string>();
 const refreshStrategies=useBackendStrategies(s=>s.refresh);
 useEffect(()=>{void refreshStrategies();},[refreshStrategies]);
 const [now,setNow]=useState(Date.now);
 const [tab,setTab]=useState('positions'),[modify,setModify]=useState<PaperOrder>();
 useEffect(()=>{void refresh();const timer=setInterval(()=>{setNow(Date.now());void refresh();},2500);return()=>clearInterval(timer);},[refresh]);
 const selected=params.get('session')??undefined;
 const setSelected=(value?:string)=>setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set('session',value);else next.delete('session');return next;});
 const [chart,setChart]=useState<PaperChartSelection>();
 const sessions=data?.sessions.filter(s=>s.mode!=='signals'||s.hasTrades)??[],positions=data?.positions.filter(p=>!selected||p.sessionId===selected)??[],orders=data?.orders.filter(o=>(!selected||o.sessionId===selected)&&['pending','confirmation'].includes(o.status))??[];
 const active=sessions.filter(s=>s.active&&s.mode!=='signals'&&(!selected||s._id===selected)),manualSession=sessions.find(s=>s._id===manual?.sessionId),settings=sessions.find(s=>s._id===editing);
 async function action(path:string){try{await apiClient.post(path);await refresh();}catch(e){message.error((e as Error).message);}}
 return <div className="page-enter"><div className="page-heading"><div><h1>Paper trading</h1><p>Open positions, orders awaiting action, and previous trades. All cash and fills are simulated.</p></div><Space wrap><Select aria-label="Filter paper trades by strategy" style={{width:230}} value={selected??'all'} onChange={v=>setSelected(v==='all'?undefined:v)} options={[{value:'all',label:'All paper strategies'},...sessions.map(s=>({value:s._id,label:`${s.strategy.name} · r${s.strategy.revision}`+(s.active?'':' · Stopped')}))]}/><Button onClick={()=>navigate('/signal-runner')}>View buy / sell signals</Button></Space></div>
  <Space orientation="vertical" size={20} style={{width:'100%'}}>
   {error&&<Alert type="error" showIcon title={error}/>}
   {!!active.length&&(!data?.workerRunning||data.feed?.state!=='live')&&<Alert showIcon type="warning" title="Paper fills are waiting" description={!data?.workerRunning?'Paper worker is offline. Keep app services running.':data?.feed?.message??'Waiting for fresh live data.'}/>}
   {data&&<PaperPnlSummary sessions={sessions.filter(s=>!selected||s._id===selected)} positions={positions}/>}
   {active.some(s=>!s.strategy.risk.overnight)&&<Alert type="info" showIcon title="Intraday auto square-off · 3:15 PM IST" description="New intraday buys stop and all remaining intraday shares are queued to sell, including in confirmation mode or when new buys are paused. Keep app services running with fresh market data; an offline app or missing quotes can delay exits. Swing and long-term positions may stay open overnight."/>}
   <Card title="Paper accounts"><Table rowKey="_id" dataSource={active} pagination={false} size="small" scroll={{x:700}} locale={{emptyText:<Empty description="No active paper trading"><Button type="primary" onClick={()=>navigate('/signal-runner?setup=1')}>Choose a strategy</Button></Empty>}} columns={[
    {title:'Strategy',render:(_,s)=><><strong>{s.strategy.name}</strong><div><StrategyHistoryButton strategy={s.strategy} context="This paper session" /></div></>},{title:'Execution',render:(_,s)=><Tag color={s.entriesPaused?'gold':'blue'}>{s.entriesPaused?'New buys paused':s.mode==='automatic'?'Automatic':'Confirm each trade'}</Tag>},
    {title:'Available cash',render:(_,s)=>money(s.cashPaise)},{title:'Realized P&L',render:(_,s)=><span className={(s.bookedPnlPaise??0)<0?'negative':'positive'}>{money(s.bookedPnlPaise)}</span>},{title:'Holding',render:(_,s)=><Tag>{s.strategy.risk.overnight?'Overnight allowed':'Square-off 3:15 PM'}</Tag>},{title:'Open positions',render:(_,s)=>data?.positions.filter(p=>p.sessionId===s._id).length??0},
    {title:'Controls',render:(_,s)=><Space wrap><Button size="small" onClick={()=>setManual({sessionId:s._id})}>Manual buy / sell</Button><Button size="small" onClick={()=>{void apiClient.patch(`/paper/sessions/${s._id}`,{entriesPaused:!s.entriesPaused}).then(refresh).catch(e=>message.error(e.message));}}>{s.entriesPaused?'Resume new buys':'Pause new buys'}</Button><Button size="small" onClick={()=>setEditing(s._id)}>Settings</Button></Space>},
   ]}/><p className="muted mt-3">Each strategy has its own paper cash. Stops and partial targets run automatically. Buy and sell rules follow your chosen execution mode. Manual intervention pauses new automatic entries.</p><p className="muted">Realized P&L includes entry and exit fees. Open P&L uses the latest received price, includes entry fees and excludes future exit fees. Quote timestamps identify stale prices.</p></Card>
   <Card><Tabs activeKey={tab} onChange={setTab} items={[
    {key:'positions',label:`Open positions (${positions.length})`,children:<Table<PaperPosition> rowKey="_id" dataSource={positions} size="small" pagination={{pageSize:15}} scroll={{x:950}} columns={[
     {title:'Stock',render:(_,p)=><StockChartButton symbol={p.symbol} onClick={()=>setChart({sessionId:p.sessionId,instrumentId:p.instrumentId})}/>} ,{title:'Strategy',render:(_,p)=>{const session=sessions.find(s=>s._id===p.sessionId);return session?<>{session.strategy.name}<div><StrategyHistoryButton strategy={session.strategy} context="This position" /></div></>:null;}},{title:'Shares remaining',render:(_,p)=>`${p.quantity} / ${p.initialQuantity??p.quantity}`},{title:'Entry',render:(_,p)=>money(p.entryPaise)},
     {title:'Last price',render:(_,p)=><>{money(p.mark?.pricePaise)}{p.mark&&<div className="muted"><Tag color={p.mark.fresh?'green':'default'}>{p.mark.fresh?'Live':'Last received'}</Tag>{new Date(p.mark.at).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})}</div>}</>},
     {title:'Open P&L',render:(_,p)=><span className={(p.mark?.unrealizedPaise??0)<0?'negative':'positive'}>{money(p.mark?.unrealizedPaise)}</span>},
     {title:'Stop',render:(_,p)=><Space>{money(p.stopPaise)}{p.breakevenActivated&&<Tag color="blue">At entry or higher</Tag>}{p.trailingActivated&&<Tag color="purple">Trailing active</Tag>}</Space>},{title:'Targets',render:(_,p)=><PaperPositionTargets position={p}/>},{title:'Manual exit',render:(_,p)=><PositionExitActions position={p} order={orders.find(o=>o.sessionId===p.sessionId&&o.instrumentId===p.instrumentId)} enabled={!!data?.workerRunning&&data.marketOpen===true} onPartial={()=>setManual({sessionId:p.sessionId,instrumentId:p.instrumentId,side:'SELL',quantity:p.quantity})} onQueued={async()=>{await refresh();setTab('orders');}}/>},
    ]} locale={{emptyText:'No open paper positions. A position appears only after a buy order fills.'}}/>},
    {key:'orders',label:`Awaiting action / fill (${orders.length})`,children:<Table<PaperOrder> rowKey="_id" size="small" dataSource={orders} pagination={{pageSize:15}} scroll={{x:1000}} columns={[
     {title:'Stock',render:(_,o)=><StockChartButton symbol={data?.symbols?.[o.instrumentId]??o.instrumentId} onClick={()=>setChart({sessionId:o.sessionId,instrumentId:o.instrumentId})}/>} ,{title:'Strategy',render:(_,o)=>{const session=sessions.find(s=>s._id===o.sessionId);return session?<>{session.strategy.name}<div><StrategyHistoryButton strategy={session.strategy} context="This paper order" /></div></>:null;}},{title:'Side',dataIndex:'side'},{title:'Shares',render:(_,o)=>o.quantity||o.estimate?.quantity||'Waiting for sizing'},
     {title:'Order price',render:(_,o)=>o.limitPaise!==undefined?<>Limit {money(o.limitPaise)}<div className="muted">{o.side==='BUY'?'or lower':'or higher'}</div></>:'Market'},{title:'Estimated fill',render:(_,o)=>money(o.estimate?.pricePaise)},{title:'Initial stop',render:(_,o)=>money(o.estimate?.stopPaise)},{title:'First target',render:(_,o)=>money(o.estimate?.targetPaise)},
     {title:'Status',render:(_,o)=><Tag>{o.status==='confirmation'?'Awaiting your approval':'Waiting for fill'}</Tag>},{title:'Reason',render:(_,o)=>o.estimate?.message??o.message??o.reason},
     {title:'Actions',render:(_,o)=>o.source==='protection'?<Tag>Automatic protective exit</Tag>:<Space wrap>{o.status==='confirmation'&&<Button size="small" disabled={!data?.feed?.freshIds.includes(o.instrumentId)||data.marketOpen===false||!!o.expiresAt&&Date.parse(o.expiresAt)<=now} onClick={()=>void action(`/paper/orders/${o._id}/confirm`)}>Confirm paper trade</Button>}<Button size="small" disabled={!o.eligibleAfter||!!o.expiresAt&&Date.parse(o.expiresAt)<=now} onClick={()=>setModify(o)}>Modify price</Button><Button size="small" onClick={()=>void action(`/paper/orders/${o._id}/cancel`)}>Cancel</Button></Space>},
    ]}/>},
    {key:'history',label:'Trade & order history',children:<PaperOrderHistory key={selected??'all'} sessionId={selected} sessions={data?.sessions??[]} onChart={(o,symbol)=>setChart({sessionId:o.sessionId,instrumentId:o.instrumentId,symbol,eventId:o.status==='filled'?`fill:${o._id}`:undefined})}/>},
   ]}/></Card>
  </Space>
  {chart&&data&&<PaperStockChart key={`${chart.sessionId}:${chart.instrumentId}:${chart.eventId??''}`} selection={chart} data={data} onClose={()=>setChart(undefined)} onChange={setChart}/>}
  <Drawer open={!!manualSession} onClose={()=>setManual(undefined)} title="Manual paper order" destroyOnHidden size={480}>{manualSession&&<><Descriptions column={1} items={[{key:'strategy',label:'Strategy',children:manualSession.strategy.name},{key:'cash',label:'Available cash',children:money(manualSession.cashPaise)}]}/><ManualPaperOrder key={`${manualSession._id}:${manual?.instrumentId}:${manual?.side}`} preset={manual} sessionId={manualSession._id} positions={data?.positions.filter(p=>p.sessionId===manualSession._id)} allowedIds={manualSession.ids?[...manualSession.ids,...(data?.positions.filter(p=>p.sessionId===manualSession._id).map(p=>p.instrumentId)??[])]:undefined} entryLimitPrice={manualSession.strategy.risk.entryOrderType==='limit'?manualSession.strategy.risk.entryLimitPrice??undefined:undefined} refresh={refresh} onSubmitted={()=>{setManual(undefined);setTab('orders');}}/></>}</Drawer>
  <Drawer open={!!modify} onClose={()=>setModify(undefined)} title="Modify paper order" destroyOnHidden size={480}>{modify&&<ModifyPaperOrder key={modify._id} order={modify} symbol={data?.symbols?.[modify.instrumentId]??modify.instrumentId} onSaved={async()=>{setModify(undefined);await refresh();}}/>}</Drawer>
  <Drawer open={!!settings} onClose={()=>setEditing(undefined)} title="Paper strategy settings" destroyOnHidden size={760}>{settings&&<MonitoringSettings key={settings._id} session={settings} onSaved={async()=>{setEditing(undefined);await refresh();}}/>}</Drawer>
 </div>;
}
