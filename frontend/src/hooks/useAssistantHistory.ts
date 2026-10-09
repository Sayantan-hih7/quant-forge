import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {apiClient} from '../services/apiClient';
import type {AiMessage} from '../services/aiAssistant';
export interface ChatSnapshot {resume?:{error?:string;qualificationState?:import('../components/layout/AssistantQualificationRun').QualificationChatState;workflow?:import('../components/layout/AssistantBacktestRun').AssistantWorkflow;backtestState?:import('../components/layout/AssistantBacktestRun').BacktestChatState;attachments?:import('../services/assistantAttachments').AssistantAttachment[];savedMessage?:string;reply?:Record<string,unknown>;reviewOpen:boolean;prompt:string;questionState?:{active:string;answers:Record<string,string>;custom:Record<string,boolean>}};messages:AiMessage[];task?:{scope:'strategy'|'monthly';id:string;revision:number};currentDraft?:unknown}
export interface ChatStorage {usedBytes:number;count:number;maxBytes:number;maxCount:number;percent:number;warningPercent:number;lastCleanupAt?:string;lastRemovedCount:number}
export interface ChatSummary {_id:string;title:string;revision:number;updatedAt:string}
export function useAssistantHistory(snapshot:ChatSnapshot){
 const [items,setItems]=useState<ChatSummary[]>([]),[id,setId]=useState<string>(()=>crypto.randomUUID()),[error,setError]=useState(''),[loading,setLoading]=useState(false),[hasMore,setHasMore]=useState(false);
 const [storage,setStorage]=useState<ChatStorage>();
 const current=useRef(snapshot);useLayoutEffect(()=>{current.current=snapshot;},[snapshot]);
 const metadata=useRef(new Map<string,{revision:number;saved:string;deleted?:boolean}>()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const chain=useRef<Promise<unknown>>(Promise.resolve());
 const refresh=useCallback(async(before?:string)=>{try{const {data}=await apiClient.get<ChatSummary[]>('/ai/conversations',{params:before?{before}:undefined});setItems(old=>before?[...old,...data.filter(r=>!old.some(o=>o._id===r._id))]:data);setHasMore(data.length===100);const usage=await apiClient.get<ChatStorage>('/ai/conversations/storage');setStorage(usage.data);}catch(e){setError(e instanceof Error?e.message:'Cannot load conversations');}},[]);
 // This effect starts an asynchronous database read; state updates occur after the request.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void refresh();},[refresh]);
 const flush=useCallback((sentMessages?:AiMessage[])=>{
  const value=sentMessages?{...current.current,messages:sentMessages,resume:current.current.resume?{...current.current.resume,prompt:''}:undefined}:current.current,key=JSON.stringify(value),meta=metadata.current.get(id)??{revision:0,saved:''};metadata.current.set(id,meta);if(!value.messages.length)return Promise.resolve();
  const operation=chain.current.catch(()=>{}).then(async()=>{if(meta.deleted||meta.saved===key)return;const {data}=await apiClient.put<{revision:number}>(`/ai/conversations/${id}`,{snapshot:value,expectedRevision:meta.revision});meta.revision=data.revision;meta.saved=key;try{sessionStorage.setItem('quantforge-active-chat',id);}catch{/* Browser storage is optional. */}setError('');await refresh();});
  chain.current=operation;return operation.catch(e=>{setError(e instanceof Error?e.message:'Chat was not saved');throw e;});
 },[id,refresh]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(current.current.messages.length&&metadata.current.get(id)?.saved!==JSON.stringify(current.current)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[id]);
 const encoded=JSON.stringify(snapshot);
 useEffect(()=>{if(!snapshot.messages.length||loading)return;timer.current=setTimeout(()=>{void flush().catch(()=>{});},600);return()=>clearTimeout(timer.current);},[encoded,flush,snapshot.messages.length,snapshot.resume?.prompt,snapshot.resume?.attachments?.length,loading]);
 const open=async(next:string)=>{clearTimeout(timer.current);setLoading(true);try{await flush();const {data}=await apiClient.get<ChatSummary&{snapshot:ChatSnapshot}>(`/ai/conversations/${next}`);metadata.current.set(next,{revision:data.revision,saved:JSON.stringify(data.snapshot)});current.current=data.snapshot;setId(next);try{sessionStorage.setItem('quantforge-active-chat',next);}catch{/* Optional. */}setError('');return data.snapshot;}finally{setLoading(false);}};
 const fresh=async()=>{clearTimeout(timer.current);setLoading(true);try{await flush();current.current={messages:[]};try{sessionStorage.removeItem('quantforge-active-chat');}catch{/* Optional. */}setId(crypto.randomUUID());}finally{setLoading(false);}};
 const rename=async(target:string,title:string)=>{await apiClient.patch(`/ai/conversations/${target}`,{title});await refresh();};
 const remove=async(target:string)=>{if(target===id)clearTimeout(timer.current);const meta=metadata.current.get(target);await chain.current.catch(()=>{});await apiClient.delete(`/ai/conversations/${target}`);if(meta)meta.deleted=true;if(target===id){current.current={messages:[]};try{sessionStorage.removeItem('quantforge-active-chat');}catch{/* Optional. */}setId(crypto.randomUUID());}await refresh();};
 return {items,id,storage,error,clearError:()=>setError(''),loading,hasMore,refresh,flush,open,fresh,rename,remove};
}
