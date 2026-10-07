import { useState } from 'react';
export type ExchangePreference = 'NSE' | 'BSE' | 'all';
const key='quantforge:qualified-exchange';
export function useExchangePreference(){
 const [exchange,setValue]=useState<ExchangePreference>(()=>{try{const saved=localStorage.getItem(key);return saved==='BSE'||saved==='all'?saved:'NSE';}catch{return 'NSE';}});
 const setExchange=(value:ExchangePreference)=>{setValue(value);try{localStorage.setItem(key,value);}catch{/* Preference remains usable when storage is unavailable. */}};
 return {exchange,setExchange};
}
export const exchangeOptions=[{value:'NSE',label:'NSE only'},{value:'BSE',label:'BSE only'},{value:'all',label:'NSE + BSE'}];
