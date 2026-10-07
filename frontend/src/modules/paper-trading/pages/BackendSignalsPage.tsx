import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import {useEffect,useState} from 'react';
import {Alert,App,Button,Card,Collapse,Drawer,Empty,Select,Space,Table,Tag} from 'antd';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {useBackendStrategies} from '../../strategies/hooks/useBackendStrategies';
import {useBackendPaper,type PaperObservation,type PaperSession} from '../hooks/useBackendPaper';
import {RunnerSetup} from '../components/RunnerSetup';
import {ExecutionReadiness} from '../components/ExecutionReadiness';
import {SignalTable} from '../components/SignalTable';
import {MonitoringSettings} from '../components/MonitoringSettings';
import {SessionStockScope} from '../components/SessionStockScope';
import {fieldLabel} from '../../qualification/config/ruleFields';
import {PaperStockChart,type PaperChartSelection} from '../components/PaperStockChart';
import {StockChartButton} from '../../stock-details/components/StockChartButton';
import {apiClient} from '../../../services/apiClient';
const modeName=(mode:PaperSession['mode'])=>mode==='signals'?'Signals only':mode==='automatic'?'Automatic paper trading':'Paper with confirmation';
const verdict=(v:boolean|null)=><Tag color={v===null?'gold':v?'green':'default'}>{v===null?'Missing data':v?'Met':'Not met'}</Tag>;
export default function BackendSignalsPage(){
 const {data,error,refresh}=useBackendPaper(),{strategies,refresh:refreshStrategies}=useBackendStrategies(),{message}=App.useApp(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const [setup,setSetup]=useState(()=>params.has('backtest')||params.get('setup')==='1'),[editing,setEditing]=useState<string>();
 useEffect(()=>{void refresh();void refreshStrategies();const timer=setInterval(()=>void refresh(),2500);return()=>clearInterval(timer);},[refresh,refreshStrategies]);
 const selected=params.get('session')??undefined;
 const setSelected=(value?:string)=>setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set('session',value);else next.delete('session');return next;});
 const [chart,setChart]=useState<PaperChartSelection>();
 const active=data?.sessions.filter(s=>s.active)??[],filtered=active.filter(s=>!selected||s._id===selected),settings=data?.sessions.find(s=>s._id===editing);
 const ids=[...new Set(filtered.flatMap(s=>s.scope?.monitoredIds??s.ids??[]))];
 async function action(path:string){try{await apiClient.post(path);await refresh();}catch(e){message.error((e as Error).message);}}
 const closeSetup=()=>{setSetup(false);if(params.has('backtest')||params.has('setup'))setParams(previous=>{const next=new URLSearchParams(previous);next.delete('backtest');next.delete('setup');return next;},{replace:true});};
 return <div className="page-enter"><div className="page-heading"><div><h1>Signal runner</h1><p>Buy and sell alerts from your saved strategies. Watch signals or connect them to paper trading.</p></div><Space wrap><Button onClick={()=>navigate('/paper-trading')}>View paper trades</Button><Button type="primary" onClick={()=>setSetup(true)}>Monitor a strategy</Button></Space></div>
  <Space orientation="vertical" size={20} style={{width:'100%'}}>
   {error&&<Alert showIcon type="error" title={error}/>}
   {!!data?.safety?.notices?.length&&<details><summary>Paper execution hours and limitations</summary>{data.safety.notices.map(note=><p key={note}>{note}</p>)}</details>}
   {data?.safety?.warnings.map(w=><Alert key={w} type="error" showIcon title="Execution safety" description={w}/>)}
   <ExecutionReadiness data={data} ids={ids} monitoring={!!active.length} error={error}/>
   <Card title="Buy / sell signals" extra={<Select aria-label="Filter signals by strategy" style={{width:230,maxWidth:'100%'}} value={selected??'all'} onChange={v=>setSelected(v==='all'?undefined:v)} options={[{value:'all',label:'All strategies'},...(data?.sessions??[]).map(s=>({value:s._id,label:`${s.strategy.name} · r${s.strategy.revision}`+(s.active?'':' · Stopped')}))]}/> }>
    <p className="muted">Signals are listed across strategies by default. An expired signal remains in history and cannot be confirmed. Sell rules are for held shares; the app does not short stocks.</p>
    {data?<SignalTable data={data} sessionId={selected} onConfirm={id=>void action(`/paper/orders/${id}/confirm`)} onSettings={setEditing} onChart={s=>setChart({sessionId:s.sessionId,instrumentId:s.instrumentId,eventId:`signal:${s._id}`})}/>:<Empty description="Loading signals"/>}
   </Card>
   <Card title={`Monitoring (${active.length} active)`}>
    <Table<PaperSession> rowKey="_id" dataSource={filtered} size="small" pagination={false} scroll={{x:850}} locale={{emptyText:<Empty description="No active strategy monitoring"><Button onClick={()=>setSetup(true)}>Monitor a strategy</Button></Empty>}} columns={[
     {title:'Strategy',render:(_,s)=>{const current=strategies.find(x=>x._id===s.strategy._id);return <><strong>{s.strategy.name}</strong><div><StrategyHistoryButton strategy={s.strategy} context="This monitoring session" /></div><div className="muted">{s.strategy.entry.cadence==='daily'?'Daily · after market close':`${s.strategy.entry.cadence} · completed candles`}</div>{current&&current.revision!==s.strategy.revision&&<div><div className="muted">This session keeps its original rules. Close positions and stop monitoring before starting the newer rules.</div></div>}</>;}},
     {title:'Stocks',render:(_,s)=><>{s.scope?.eligibleIds.length??s.ids?.length??0} qualified{(s.scope?.excludedIds.length??0)>0&&<div className="negative">{s.scope!.excludedIds.length} selected stocks excluded</div>}{s.scope?.eligibleIds.length===0&&<div><Tag color="gold">No eligible buy stocks</Tag><Button size="small" type="link" onClick={()=>setEditing(s._id)}>Update stock selection</Button></div>}</>},
     {title:'Execution',render:(_,s)=><Tag color={s.mode==='automatic'?'blue':'default'}>{modeName(s.mode)}{s.entriesPaused?' · Entries paused':''}</Tag>},
     {title:'Why waiting / last result',render:(_,s)=><div style={{maxWidth:390}}>{s.message??'Waiting for the next completed candle.'}<div className="muted">{s.checkedAt?new Date(s.checkedAt).toLocaleTimeString('en-IN'):'Not checked yet'}</div></div>},
     {title:'Manage',render:(_,s)=><Space wrap><Button size="small" onClick={()=>setEditing(s._id)}>Settings</Button>{s.mode==='signals'&&s.entriesPaused&&<Button size="small" onClick={()=>void apiClient.patch(`/paper/sessions/${s._id}`,{entriesPaused:false}).then(refresh).catch(e=>message.error(e.message))}>Resume signals</Button>}{s.mode!=='signals'&&<Button size="small" onClick={()=>navigate(`/paper-trading?session=${s._id}`)}>Paper trades</Button>}<Button size="small" disabled={!!data?.positions.some(p=>p.sessionId===s._id)} onClick={()=>void action(`/paper/sessions/${s._id}/stop`)}>Stop monitoring</Button></Space>},
    ]} expandable={{expandedRowRender:s=><SessionStockScope session={s} symbols={data?.symbols} onChart={instrumentId=>setChart({sessionId:s._id,instrumentId})}/>}}/>
   </Card>
   <Collapse items={[{key:'checks',label:'Latest rule checks — see why stocks did or did not match',children:<>
    <p>Latest evaluated candles, not live entry instructions. Daily strategies wait for a new completed daily candle. Conditions can remain unmet even after a profitable backtest.</p>
    <Table<PaperObservation> rowKey="_id" size="small" scroll={{x:700}} dataSource={data?.observations?.filter(o=>(!selected||o.sessionId===selected)&&active.some(s=>s._id===o.sessionId&&(!s.scope||s.scope.monitoredIds.includes(o.instrumentId))))??[]} pagination={{pageSize:10}} locale={{emptyText:'No completed-candle check yet. The monitoring status above shows what each strategy is waiting for.'}} columns={[
     {title:'Stock',render:(_,o)=><StockChartButton symbol={data?.symbols?.[o.instrumentId]??o.instrumentId} onClick={()=>setChart({sessionId:o.sessionId,instrumentId:o.instrumentId})}/>} ,{title:'Strategy',render:(_,o)=>{const session=data?.sessions.find(s=>s._id===o.sessionId);return session?<>{session.strategy.name}<div><StrategyHistoryButton strategy={session.strategy} context="This rule check" /></div></>:null;}},
     {title:'Buy rules',render:(_,o)=>verdict(o.entry.matched)},{title:'Sell rules',render:(_,o)=>o.exit.disabled?<Tag>Stops & targets</Tag>:verdict(o.exit.matched)},
     {title:'Candle / data',render:(_,o)=><>{o.barEnd?new Date(o.barEnd).toLocaleString('en-IN'):'No completed candle'}{!o.current&&<Tag color="gold">Candle history delayed</Tag>}</>},
    ]} expandable={{expandedRowRender:o=><Space orientation="vertical">{(['entry','exit'] as const).map(side=><div key={side}><strong>{side==='entry'?'Buy conditions':o.exit.disabled?'Stops and targets only ? no indicator sell condition':'Sell conditions'}</strong>{o[side].checks.map((c,i)=><div key={i}>{verdict(c.matched)} {fieldLabel(c.missingField??c.field)} {c.left?.toFixed(2)} {c.right==null?'':` / ${c.right.toFixed(2)}`} {c.reason}</div>)}</div>)}</Space>}}/>
    {data?.history&&<p className="muted">History: {data.history.state}. {data.history.message??data.history.errors?.join('; ')}</p>}
   </>} ]}/>
  </Space>
  {chart&&data&&<PaperStockChart key={`${chart.sessionId}:${chart.instrumentId}:${chart.eventId??''}`} selection={chart} data={data} onClose={()=>setChart(undefined)} onChange={setChart}/>}
  <Drawer title="Monitor a strategy" open={setup} onClose={closeSetup} size={900} destroyOnHidden><RunnerSetup strategies={strategies.filter(s=>!s.archivedAt)} sessions={data?.sessions??[]} paper={data} statusError={error} onStarted={async()=>{closeSetup();await refresh();}}/></Drawer>
  <Drawer title="Monitoring settings" open={!!settings} onClose={()=>setEditing(undefined)} size={760} destroyOnHidden>{settings&&<MonitoringSettings key={settings._id} session={settings} onSaved={async()=>{setEditing(undefined);await refresh();}}/>}</Drawer>
 </div>;
}
