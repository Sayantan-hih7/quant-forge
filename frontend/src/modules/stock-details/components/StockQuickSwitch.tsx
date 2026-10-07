import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { apiClient } from '../../../services/apiClient';
import { useRecentStocks } from '../store/recentStocks';
import type { StockListing } from '../types';

export function StockQuickSwitch({ onSelect }: { onSelect: (stock: StockListing) => void }) {
 const recent = useRecentStocks(s => s.items);
 const [search, setSearch] = useState('');
 const query = search.trim();
 const [result, setResult] = useState<{query:string;rows:StockListing[];error?:boolean}>({query:'',rows:[]});
 useEffect(() => {
  if(query.length<2)return;
  const controller=new AbortController();
  const timer=setTimeout(()=>{void apiClient.get<StockListing[]>('/market-data/instruments',{params:{q:query},signal:controller.signal})
   .then(({data})=>{if(!controller.signal.aborted)setResult({query,rows:data.filter(s=>s.active!==false)});})
   .catch(()=>{if(!controller.signal.aborted)setResult({query,rows:[],error:true});});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query]);
 const searching=query.length>=2,loading=searching&&result.query!==query;
 const rows=searching?result.query===query?result.rows:[]:recent;
 return <Select className="stock-quick-switch" aria-label="Switch stock" suffixIcon={<SearchOutlined/>} showSearch value={null}
  searchValue={search} onSearch={setSearch} filterOption={false} virtual={false} placeholder="Switch stock - search NSE / BSE" loading={loading}
  onChange={id=>{const next=rows.find(s=>s._id===id);if(next)onSelect(next);setSearch('');}}
  options={[{label:searching?'Search results':'Recently viewed - or type to search',options:rows.map(s=>({value:s._id,label:`${s.symbol} - ${s.exchange}${s.name?' - '+s.name:''}`}))}]}
  notFoundContent={loading?'Searching...':searching&&result.error?'Search unavailable. Try again.':searching?'No matching stocks':'Search by name or symbol (at least 2 characters)'}/>;
}
