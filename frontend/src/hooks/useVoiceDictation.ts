import {useEffect,useRef,useState} from 'react';
interface SpeechResult {isFinal:boolean;[index:number]:{transcript:string}}
interface Recognition {
 lang:string;continuous:boolean;interimResults:boolean;
 onresult:((event:{results:ArrayLike<SpeechResult>})=>void)|null;
 onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
 start:()=>void;stop:()=>void;abort:()=>void;
}
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export function useVoiceDictation(onText:(value:string)=>void,active:boolean){
 const [listening,setListening]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const duration=error.startsWith('No speech detected')?6000:error.startsWith('Voice dictation could not connect')?8000:0;
  if(!duration)return;
  const timer=window.setTimeout(()=>setError(''),duration);
  return ()=>window.clearTimeout(timer);
 },[error]);
 const recognition=useRef<Recognition|null>(null),callback=useRef(onText);
 useEffect(()=>{callback.current=onText;},[onText]);
 const constructor=(window as SpeechWindow).SpeechRecognition??(window as SpeechWindow).webkitSpeechRecognition;
 const cancel=()=>{const current=recognition.current;recognition.current=null;if(current){current.onresult=null;current.onerror=null;current.onend=null;current.abort();}setListening(false);};
 useEffect(()=>{if(!active){const current=recognition.current;if(current){current.onresult=null;current.onerror=null;current.abort();}}},[active]);
 useEffect(()=>()=>{const current=recognition.current;if(current){current.onresult=null;current.onerror=null;current.onend=null;current.abort();}},[]);
 const start=(existing:string)=>{
  if(!constructor){setError('Voice dictation is not available in this browser. Try Chrome or Edge, or type your message.');return;}
  cancel();setError('');const current=new constructor();recognition.current=current;
  current.lang=navigator.language||'en-IN';current.continuous=true;current.interimResults=true;
  current.onresult=event=>{if(recognition.current!==current)return;const spoken=Array.from(event.results).map(result=>result[0]?.transcript??'').join(' ');callback.current((existing.trim()+(existing.trim()?' ':'')+spoken).slice(0,1200));};
  current.onerror=event=>{if(recognition.current!==current)return;setError(event.error==='not-allowed'?'Microphone access was denied. Allow it in your browser settings or type instead.':event.error==='no-speech'?'No speech detected. Try again or type your message.':'Voice dictation could not connect. Try again or type your message.');cancel();};
  current.onend=()=>{if(recognition.current===current){recognition.current=null;setListening(false);}};
  try{current.start();setListening(true);}catch{cancel();setError('Could not start the microphone. Check browser permissions.');}
 };
 return {supported:!!constructor,listening:active&&listening,error,dismissError:()=>setError(''),start,stop:()=>{setListening(false);try{recognition.current?.stop();}catch{cancel();}},cancel};
}
