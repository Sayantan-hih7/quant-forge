import {useEffect,useLayoutEffect,useRef} from 'react';
import {App} from 'antd';
import type {ReactNode} from 'react';
export default function AssistantErrorToast({text,title,active,onClear,action,type='error'}:{text:string;title:string;active:boolean;onClear:()=>void;action?:ReactNode;type?:'error'|'warning'}){
 const {notification:api}=App.useApp();const clear=useRef(onClear),actions=useRef(action);
 useLayoutEffect(()=>{clear.current=onClear;actions.current=action;},[onClear,action]);
 useEffect(()=>{if(!text||!active)return;api[type]({key:'assistant-error',title,description:text,duration:8,placement:'topRight',actions:actions.current,onClose:()=>clear.current()});return()=>api.destroy('assistant-error');},[api,text,title,active,type]);
 return null;
}
