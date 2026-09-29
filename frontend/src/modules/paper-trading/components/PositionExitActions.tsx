import {useRef,useState} from 'react';
import {App,Button,Popconfirm,Space,Tooltip} from 'antd';
import {apiClient} from '../../../services/apiClient';
import type {PaperOrder,PaperPosition} from '../hooks/useBackendPaper';

export function PositionExitActions({position,order,enabled,onPartial,onQueued}:{position:PaperPosition;order?:PaperOrder;enabled:boolean;onPartial:()=>void;onQueued:()=>Promise<void>}){
 const {message}=App.useApp(),[busy,setBusy]=useState(false),id=useRef(crypto.randomUUID());
 const pendingFullExit=order?.side==='SELL'&&order.status==='pending'&&order.limitPaise===undefined&&(order.quantity===0||order.quantity>=position.quantity);
 async function exit(){
  if(busy)return;setBusy(true);
  try{await apiClient.post(`/paper/positions/${encodeURIComponent(position._id)}/exit`,{id:id.current,expectedOpenedAt:position.openedAt});message.success('Exit queued for all remaining shares. Waiting for the next fresh quote.');await onQueued();id.current=crypto.randomUUID();}
  catch(e){message.error((e as Error).message);}finally{setBusy(false);}
 }
 return <Space wrap><Tooltip title={!enabled?'Exits need the paper worker during market hours.':pendingFullExit?'A full exit is already waiting for a fresh quote.':undefined}>
  <Popconfirm title={`Sell all ${position.quantity} ${position.symbol} shares?`} description={<>Exit at the next available price. New automatic buys will pause.{order&&!pendingFullExit&&<div>Your existing unfilled order will be replaced.</div>}</>} okText="Exit all shares" onConfirm={exit} disabled={!enabled||!position.openedAt||pendingFullExit||busy}>
   <Button danger size="small" loading={busy} disabled={!enabled||!position.openedAt||pendingFullExit}>{pendingFullExit?'Exit pending':'Exit all'}</Button>
  </Popconfirm></Tooltip><Button size="small" disabled={!enabled||pendingFullExit} onClick={onPartial}>Sell quantity</Button></Space>;
}
