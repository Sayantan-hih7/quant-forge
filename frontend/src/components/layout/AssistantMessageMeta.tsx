import {useState} from 'react';
import {Button,Tooltip} from 'antd';
import {CopyOutlined,CheckOutlined,EditOutlined} from '@ant-design/icons';
import type {AiMessage} from '../../services/aiAssistant';
export default function AssistantMessageMeta({item,onRetry,disabled}:{item:AiMessage;onRetry:()=>void;disabled:boolean}){
 const [copied,setCopied]=useState<string|null>(null),[error,setError]=useState('');
 const timestamp=item.createdAt?new Date(item.createdAt):undefined;
 const date=timestamp&&!Number.isNaN(timestamp.getTime())?timestamp:undefined;
 const copy=async()=>{try{await navigator.clipboard.writeText(item.text);setCopied(item.text);setError('');}catch{setError('Could not copy. Select the message text to copy it.');}};
 return <div className="assistant-message-meta">
 <strong>{item.role==='user'?'You':'QuantForge'}</strong>
 {date?<time dateTime={item.createdAt} title={date.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'full',timeStyle:'long'})}>{date.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} IST</time>:<span className="assistant-message-time">Time not recorded</span>}
 {item.durationMs!==undefined&&<span title="Elapsed request time, including preparation, AI processing and network time">{(item.durationMs/1000).toFixed(1)} s {item.status==='failed'?'before failure':item.status==='stopped'?'before stop':'response'}</span>}
 {item.status==='failed'&&item.role==='user'&&<span className="assistant-message-failed">Failed</span>}
 {item.status==='stopped'&&<span>Stopped</span>}
 <Tooltip title={copied===item.text?'Copied as Markdown':'Copy message'}><Button size="small" type="text" aria-label="Copy message" icon={copied===item.text?<CheckOutlined/>:<CopyOutlined/>} onClick={()=>void copy()}/></Tooltip>
 {item.role==='user'&&(item.status==='failed'||item.status==='stopped')&&<Button size="small" type="text" icon={<EditOutlined/>} disabled={disabled} onClick={onRetry}>Edit and retry</Button>}
 {error&&<small role="alert">{error}</small>}
 </div>;
}
