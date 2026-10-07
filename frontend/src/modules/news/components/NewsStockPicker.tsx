import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { apiClient } from '../../../services/apiClient';
export interface NewsStock { _id: string; symbol: string; name?: string; exchange: string; isin: string }
export function NewsStockPicker({value,onChange,exchange}:{value?:NewsStock;onChange:(value:NewsStock|undefined)=>void;exchange?:string}) {
 const [search,setSearch]=useState('');
 const key=`${exchange??'all'}:${search.trim()}`;
 const [result,setResult]=useState<{key:string;rows:NewsStock[];error:boolean}>({key:'',rows:[],error:false});
 const active=search.trim().length>=2,busy=active&&result.key!==key;
 const rows=active&&result.key===key?result.rows:[],error=result.key===key&&result.error;
 useEffect(()=>{
  const controller=new AbortController();
  if(!active)return()=>controller.abort();
  const timer=setTimeout(()=>{void apiClient.get<NewsStock[]>('/market-data/instruments',{params:{q:search.trim(),...(exchange?{exchange}:{})},signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted)setResult({key,rows:data.filter(row=>!exchange||row.exchange===exchange),error:false});}).catch(()=>{if(!controller.signal.aborted)setResult({key,rows:[],error:true});});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[search,exchange,key,active]);
 const options=[...(value?[value]:[]),...rows.filter(row=>row._id!==value?._id)];
 return <Select aria-label="Filter by stock" showSearch allowClear filterOption={false} placeholder="All stocks - search name or symbol" value={value?._id} loading={busy} onSearch={setSearch} onChange={id=>{onChange(options.find(row=>row._id===id));setSearch('');}} options={options.map(row=>({value:row._id,label:`${row.symbol} - ${row.exchange}${row.name?' - '+row.name:''}`}))} notFoundContent={busy?'Searching...':error?'Stock search unavailable. Try again.':search.trim().length<2?'Type at least 2 characters':'No stocks found'} style={{width:320,maxWidth:'100%'}} />;
}
