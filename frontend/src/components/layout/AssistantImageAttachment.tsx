import {useEffect,useState} from 'react';
import {Image,Tooltip} from 'antd';
import type {AssistantAttachment} from '../../services/assistantAttachments';
export default function AssistantImageAttachment({file,compact=false}:{file:Extract<AssistantAttachment,{kind:'image'}>;compact?:boolean}){
 const [open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);}};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true);},[open]);
 return <Tooltip title={file.name}><span className={compact?'assistant-image-thumb':'assistant-image-history'}>
  <button type="button" className="assistant-image-open" aria-label={`Preview ${file.name}`} onClick={()=>setOpen(true)}><img src={`data:${file.mimeType};base64,${file.data}`} alt={file.name}/></button>
  <Image style={{display:'none'}} src={`data:${file.mimeType};base64,${file.data}`} alt={file.name} preview={{open,onOpenChange:setOpen}}/>
 </span></Tooltip>;
}
