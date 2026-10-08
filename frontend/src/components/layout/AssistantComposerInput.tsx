import {useState, type RefObject} from 'react';
import {Button, Input, Space} from 'antd';
import type {TextAreaRef} from 'antd/es/input/TextArea';
import AssistantMarkdown from './AssistantMarkdown';

import {clipboardMarkdown,continueList} from '../../services/assistantComposer';
export default function AssistantComposerInput({input,value,onChange,disabled,onSend,onFile,onLargePaste}:{input:RefObject<TextAreaRef|null>;value:string;onChange:(value:string)=>void;disabled:boolean;onSend:()=>void;onFile:(file:File)=>void;onLargePaste:(text:string)=>void}) {
 const [preview,setPreview]=useState(false),[expanded,setExpanded]=useState(false),[formatting,setFormatting]=useState(false);
 const apply=(next:string,caret:number)=>{onChange(next);requestAnimationFrame(()=>{input.current?.focus();input.current?.resizableTextArea?.textArea.setSelectionRange(caret,caret);});};
 const format=(kind:string)=>{
   const el=input.current?.resizableTextArea?.textArea;const start=el?.selectionStart??value.length,end=el?.selectionEnd??start,selected=value.slice(start,end);
   const prefix:Record<string,string>={bullet:'- ',number:'1. ',check:'- [ ] '};
   let replacement=kind==='bold'?`**${selected||'text'}**`:kind==='italic'?`*${selected||'text'}*`:kind==='code'?`\n\`\`\`\n${selected||'code'}\n\`\`\`\n`:kind==='table'?'\n| Stock | Reason |\n| --- | --- |\n| RELIANCE | Add your reason |\n':selected.split('\n').map((line,i)=>(kind==='number'?`${i+1}. `:prefix[kind])+line).join('\n');
   if(prefix[kind]&&start>0&&value[start-1]!=='\n')replacement='\n'+replacement;
   const next=value.slice(0,start)+replacement+value.slice(end);
   if(next.length<=1200)apply(next,start+replacement.length);
 };
 return <div className="assistant-editor">
 <div className="assistant-format-toolbar"><Button size="small" type="text" aria-expanded={formatting} onClick={()=>setFormatting(!formatting)}>Format</Button><Space size={2}><Button size="small" type="text" onClick={()=>setPreview(!preview)}>{preview?'Edit text':'Preview'}</Button><Button size="small" type="text" onClick={()=>setExpanded(!expanded)}>{expanded?'Collapse':'Expand'}</Button></Space></div>
 <div className="assistant-format-options" hidden={!formatting}>{[['bold','Bold'],['italic','Italic'],['bullet','Bullets'],['number','Numbered list'],['check','Checklist'],['code','Code'],['table','Table']].map(([key,label])=><Button size="small" type="text" key={key} disabled={disabled||preview} onMouseDown={e=>e.preventDefault()} onClick={()=>format(key)}>{label}</Button>)}</div>
 {preview?<div className="assistant-compose-preview"><AssistantMarkdown text={value||'Nothing to preview yet.'}/></div>:<Input.TextArea ref={input} aria-label="Message QuantForge assistant" placeholder="Describe your idea, or ask me to improve your saved rules..." value={value} disabled={disabled} maxLength={1200} autoSize={{minRows:expanded?8:3,maxRows:expanded?16:6}} onChange={e=>onChange(e.target.value)} onPaste={event=>{
 const image=Array.from(event.clipboardData.files).find(file=>file.type.startsWith('image/'));if(image){event.preventDefault();onFile(image);return;}
 const plain=event.clipboardData.getData('text/plain'),text=clipboardMarkdown(plain,event.clipboardData.getData('text/html'));
 const {selectionStart:start,selectionEnd:end}=event.currentTarget;
 if(text.length+value.length-(end-start)>1200){event.preventDefault();onLargePaste(text);}else if(text!==plain){event.preventDefault();apply(value.slice(0,start)+text+value.slice(end),start+text.length);}
 }} onKeyDown={event=>{
 if(event.nativeEvent.isComposing)return;
 if((event.ctrlKey||event.metaKey)&&['b','i'].includes(event.key.toLowerCase())){event.preventDefault();format(event.key.toLowerCase()==='b'?'bold':'italic');return;}
 if(event.key==='Tab'){
   const el=event.currentTarget,start=value.lastIndexOf('\n',el.selectionStart-1)+1,end=el.selectionEnd;
   if(/^\s*(?:[-*+] |\d+[.)] )/.test(value.slice(start,end))){event.preventDefault();const changed=value.slice(start,end).split('\n').map(line=>event.shiftKey?line.replace(/^ {1,2}/,''):'  '+line).join('\n');const next=value.slice(0,start)+changed+value.slice(end);if(next.length<=1200)apply(next,start+changed.length);return;}
 }
 if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&(value.slice(0,event.currentTarget.selectionStart).match(/^\s*```/gm)?.length??0)%2===1)return;
 if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();const el=event.currentTarget;const next=!(event.ctrlKey||event.metaKey)&&continueList(value,el.selectionStart,el.selectionEnd);if(next){if(next.value.length<=1200)apply(next.value,next.caret);}else onSend();}
 }}/>}<span className="assistant-editor-count">{value.length.toLocaleString()} / 1,200 | Longer pastes become an attachment</span>
 </div>;
}
