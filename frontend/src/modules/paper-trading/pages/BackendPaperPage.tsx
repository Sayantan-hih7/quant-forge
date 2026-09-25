import {useEffect,useState} from 'react';
import {Alert,App,Button,Card,Descriptions,Drawer,Empty,Select,Space,Table,Tabs,Tag} from 'antd';
import {useNavigate,useSearchParams} from 'react-router-dom';




import {useBackendStrategies} from '../../strategies/hooks/useBackendStrategies';
import {useBackendPaper,type PaperOrder,type PaperPosition,type PaperSignal} from '../hooks/useBackendPaper';
import {ManualPaperOrder} from '../components/ManualPaperOrder';
import {RunnerSetup} from '../components/RunnerSetup';
import {apiClient} from '../../../services/apiClient';

const money=(paise:number)=>`₹${(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export default function BackendPaperPage({runner=false}:{runner?:boolean}){
  const {data,error,refresh}=useBackendPaper(),{strategies,refresh:refreshStrategies}=useBackendStrategies(),{message}=App.useApp(),navigate=useNavigate();
  const [selected,setSelected]=useState<string>(),[manual,setManual]=useState(false),[view,setView]=useState('inspect');
  const [params]=useSearchParams();
  useEffect(()=>{void refresh();void refreshStrategies();const timer=setInterval(()=>void refresh(),2500);return()=>clearInterval(timer);},[refresh,refreshStrategies]);
  const session=data?.sessions.find(s=>s._id===selected)??data?.sessions.find(s=>s.strategy._id===params.get('strategy'))??data?.sessions[0],positions=data?.positions.filter(p=>p.sessionId===session?._id)??[],orders=data?.orders.filter(o=>o.sessionId===session?._id)??[],signals=data?.signals.filter(s=>s.sessionId===session?._id)??[];
  const showSessions = !runner || view === 'sessions';
  async function action(path:string,body:object={}){try{await apiClient.post(path,body);await refresh();}catch(e){message.error((e as Error).message);}}
  return <div className="page-enter"><div className="page-heading"><div><h1>{runner?'Signal runner':'Paper trading'}</h1><p>{runner?'Monitor both sides of a saved strategy on completed candles.':'Paper cash, positions and orders persisted in your local database.'}</p></div><Space><Button onClick={()=>navigate('/data-sources')}>Connections & Data</Button><Button onClick={()=>navigate(runner?'/paper-trading':'/signal-runner')}>{runner?'Paper trading':'Signal runner'}</Button></Space></div>
    <Space orientation="vertical" size={20} style={{width:'100%'}}>
      {runner&&<Tabs activeKey={view} onChange={setView} items={[{key:'inspect',label:'Inspect rules'},{key:'sessions',label:`Monitoring sessions (${data?.sessions.length??0})`}]}/>}
      {error&&<Alert type="error" showIcon title={error}/>}
      {showSessions&&data&&!data.workerRunning&&<Alert type="warning" showIcon title="Paper worker is offline" description="Start the backend paper worker. No order fills or automated monitoring occur while it is offline."/>}
      {showSessions&&<Alert type="info" showIcon title="Paper only · no broker orders" description="Buy rules apply to the current monthly qualified list. Sell rules apply to held shares, even if a stock leaves that list. Automatic mode queues paper orders; confirmation mode waits for your approval. Protective stops, targets and session exits run automatically in both modes."/>}
      {showSessions&&data?.feed&&<Alert type={data.feed.state==='live'?'success':'warning'} showIcon title={data.feed.state==='live'?'Execution feed connected':'Execution feed not ready'} description={data.feed.message} action={<Button onClick={()=>navigate('/data-sources')}>Manage connection</Button>}/>}
      {runner&&<div hidden={view!=='inspect'}><RunnerSetup strategies={strategies} sessions={data?.sessions??[]} onStarted={async id=>{setSelected(id);setView('sessions');await refresh();}}/></div>}
      {showSessions&&data&&!session&&<Empty description="No paper monitoring sessions yet"><Button onClick={()=>runner?setView('inspect'):navigate('/signal-runner')}>Inspect a strategy</Button></Empty>}
      {showSessions&&session&&<><Card title={<Space>Paper session<Tag color={session.entriesPaused?'gold':data?.feed?.state==='live'?'blue':'orange'}>{!session.active?'Stopped':session.entriesPaused?'Entries paused':data?.feed?.state==='live'?'Monitoring':'Waiting for feed'}</Tag></Space>} extra={<Select aria-label="Paper session" style={{minWidth:200}} value={session._id} onChange={setSelected} options={data!.sessions.map(s=>({value:s._id,label:s.strategy.name}))}/>}>
        <Descriptions items={[{key:'strategy',label:'Saved buy/sell pair',children:session.strategy.name},{key:'mode',label:'Execution',children:session.mode},{key:'scope',label:'Selected stocks',children:session.ids?.length??'Current qualified list'},{key:'cash',label:'Available paper cash',children:money(session.cashPaise)},{key:'capital',label:'Initial paper capital',children:money(session.initialPaise)},{key:'held',label:'Open positions',children:positions.length},{key:'checked',label:'Last check',children:session.checkedAt?new Date(session.checkedAt).toLocaleTimeString():'Waiting'}]}/>
        <Alert type="info" title={session.message??'Waiting for completed candles'} className="mb-5"/>
        <Space wrap><Button disabled={!session.active} onClick={()=>{void apiClient.patch(`/paper/sessions/${session._id}`,{entriesPaused:!session.entriesPaused}).then(()=>refresh()).catch(e=>message.error(e.message));}}>{session.entriesPaused?'Resume automatic entries':'Pause automatic entries'}</Button><Button disabled={!session.active} onClick={()=>setManual(true)}>Manual buy / sell</Button><Button onClick={()=>{void apiClient.get<{_id:string}[]>('/paper/instruments').then(async r=>{await apiClient.post('/market-feed/connect',{ids:[...new Set([...(data?.sessions.filter(s=>s.active).flatMap(s=>s.ids??r.data.map(stock=>stock._id))??[]),...(data?.positions.map(p=>p.instrumentId)??[])])]});navigate('/data-sources');}).catch(e=>message.error(e.message));}}>Connect execution feed</Button><Button disabled={!session.active||positions.length>0} onClick={()=>void action(`/paper/sessions/${session._id}/stop`)}>Stop monitoring</Button></Space>
        <p className="muted mt-3">This session keeps the strategy settings saved at its creation. Editing the builder applies to future sessions. Manual intervention pauses automatic entries; sell rules and protective exits remain active.</p>
      </Card>
      {runner&&<Card title="Candle-close signals"><Table<PaperSignal> rowKey="_id" dataSource={signals} size="small" pagination={{pageSize:10}} columns={[{title:'Stock',dataIndex:'instrumentId'},{title:'Rule side',dataIndex:'side',render:s=><Tag color={s==='BUY'?'green':'red'}>{s}</Tag>},{title:'Candle closed',dataIndex:'barEnd',render:x=>new Date(x).toLocaleString()},{title:'Result',render:(_,s)=>s.message??(s.orderId?'Paper order recorded':'No order')}]}/></Card>}
      {!runner&&<Card title="Held paper shares"><Table<PaperPosition> rowKey="_id" dataSource={positions} size="small" pagination={false} scroll={{x:600}} columns={[{title:'Stock',dataIndex:'symbol'},{title:'Shares',dataIndex:'quantity'},{title:'Entry',dataIndex:'entryPaise',render:money},{title:'Stop',dataIndex:'stopPaise',render:money},{title:'Target',dataIndex:'targetPaise',render:money}]}/></Card>}
      <Card title="Paper order activity"><Table<PaperOrder> rowKey="_id" dataSource={orders} size="small" pagination={{pageSize:10}} scroll={{x:1000}} columns={[{title:'Stock',dataIndex:'instrumentId'},{title:'Side',dataIndex:'side'},{title:'Shares',dataIndex:'quantity',render:x=>x||'Risk sized at fill'},{title:'Source',dataIndex:'source'},{title:'Status',dataIndex:'status',render:s=><Tag color={s==='filled'?'green':s==='confirmation'?'gold':s==='rejected'?'red':'default'}>{s}</Tag>},{title:'Fill',render:(_,o)=>o.fillPaise?money(o.fillPaise):'—'},{title:'Details',render:(_,o)=>o.message??o.reason},{title:'Actions',render:(_,o)=><Space>{o.status==='confirmation'&&<Button size="small" onClick={()=>void action(`/paper/orders/${o._id}/confirm`)}>Confirm paper trade</Button>}{['pending','confirmation'].includes(o.status)&&<Button size="small" onClick={()=>void action(`/paper/orders/${o._id}/cancel`)}>Cancel</Button>}</Space>}]}/></Card>
      <Drawer open={manual} onClose={()=>setManual(false)} title="Manual paper order" destroyOnHidden size={480}><ManualPaperOrder sessionId={session._id} allowedIds={session.ids?[...session.ids,...positions.map(p=>p.instrumentId)]:undefined} refresh={refresh}/></Drawer>
      </>}
    </Space>
  </div>;
}
