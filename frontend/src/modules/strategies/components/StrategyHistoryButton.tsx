import { useState } from 'react';
import { Button,Tag } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { useBackendStrategies,type SavedStrategy } from '../hooks/useBackendStrategies';
import { StrategyHistoryDrawer } from './StrategyHistoryDrawer';

export function StrategyHistoryButton({strategy,context,label,history=false}:{strategy:SavedStrategy;context?:string;label?:string;history?:boolean}){
  const [open,setOpen]=useState(false);
  const current=useBackendStrategies(s=>s.strategies.find(v=>v._id===strategy._id));
  const older=!!current&&current.revision!==strategy.revision;
  return <><Button size={history?'middle':'small'} type={history?'default':'link'} icon={<HistoryOutlined aria-hidden/>} onClick={()=>setOpen(true)} aria-label={label??`View rules and changes for revision ${strategy.revision}`}>
    {label??`Revision ${strategy.revision}`}</Button>{!history&&older&&<Tag color="gold">Earlier rules · current {current.revision}</Tag>}
    {open&&<StrategyHistoryDrawer key={strategy._id} strategyId={strategy._id} used={history?undefined:strategy} context={context} onClose={()=>setOpen(false)}/>}
  </>;
}
