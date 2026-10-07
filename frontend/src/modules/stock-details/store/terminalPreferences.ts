import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const order = ['company','trade','qualification','related','technicals','financials','news','events'];
interface Preferences {
 order:string[];hidden:string[];stacked:boolean;section:string;
 configure:(patch:Partial<Pick<Preferences,'order'|'hidden'|'stacked'|'section'>>)=>void;
 reset:()=>void;
}
export const useTerminalPreferences=create<Preferences>()(persist(set=>({
 order,hidden:[],stacked:false,section:'company',configure:patch=>set(patch),reset:()=>set({order,hidden:[],stacked:false,section:'company'}),
}),{
 name:'quantforge-stock-terminal',version:1,
 partialize:({order,hidden,stacked,section})=>({order,hidden,stacked,section}),
 merge:(saved,current)=>{
  const value=saved as Partial<Preferences>|undefined;
  const clean=(v:unknown)=>Array.isArray(v)?[...new Set(v.filter((k):k is string=>typeof k==='string'&&order.includes(k)))]:[];
  const stored=clean(value?.order);
  return {...current,order:[...stored,...order.filter(k=>!stored.includes(k))],hidden:clean(value?.hidden),stacked:value?.stacked===true,section:typeof value?.section==='string'&&order.includes(value.section)?value.section:'company'};
 },
}));
