import { Alert, Collapse, Popover, Table, Tag } from 'antd';
import type { ScopedStock } from '../../strategies/hooks/useQualifiedStockScope';
import type { Horizon } from '../../qualification/types';

export function BacktestStockSuitability({stocks,value,horizon,historical,loading,onChange}:{stocks:ScopedStock[];value:string[];horizon:Horizon;historical:boolean;loading:boolean;onChange:(ids:string[])=>void}){
 const profileKey=horizon;
 const label=profileKey==='swing'?'Swing / short-term':profileKey==='intraday'?'Intraday':'Long-term';
 const profile=(stock:ScopedStock)=>stock.suitability?.profiles.find(p=>p.horizon===profileKey);
 const selected=stocks.filter(s=>value.includes(s._id));
 const outside=selected.filter(s=>profile(s)?.status==='not-matched');
 const unknown=selected.filter(s=>!profile(s)||profile(s)?.status==='unavailable');
 if(historical)return <Alert className="mb-5" type="info" showIcon title="Historical suitability is assessed during replay" description="Today's research profiles are not applied to past published lists. The report will identify missing history and execution constraints for the selected dates." />;
 if(loading)return null;
 return <div className="mb-5">
   <Alert type={outside.length||unknown.length?'warning':'info'} showIcon title={`${label} screening: ${selected.length-outside.length-unknown.length} selected matches, ${outside.length} outside profile, ${unknown.length} need data`}
     description="Based on recent liquidity, volatility, trend and company data for this holding period. This does not validate your exact buy/sell rules or historical suitability. Stocks outside the profile can still be tested; missing inputs are not a failed match." />
   <Collapse style={{marginTop:12}} items={[{key:'fit',label:`Review stock suitability for ${label.toLowerCase()}`,children:<>
     <p>Hover or click a status for the criteria. Selecting matches replaces your current selection; review it before running.</p>
     <Table<ScopedStock> size="small" rowKey="_id" dataSource={stocks} pagination={{pageSize:5,showSizeChanger:false}} scroll={{x:460}}
       rowSelection={{selectedRowKeys:value,onChange:keys=>onChange(keys.map(String))}}
       columns={[{title:'Stock',render:(_,s)=><>{s.symbol}<div className="muted">{s.exchange}{s.source==='manual'?' ? Manually added':''}</div></>},
       {title:`${label} profile`,render:(_,s)=>{const p=profile(s);return <Popover trigger={['hover','click']} content={<div style={{maxWidth:360}}>
         {p?.checks.map(c=><p key={c.label}><strong>{c.label}: {c.status==='pass'?'Pass':c.status==='fail'?'Outside criteria':'Needs data'}</strong><br/>{c.rule}{c.value!==null?` | Actual ${c.value.toLocaleString('en-IN',{maximumFractionDigits:2})} ${c.unit}`:''}<br/><small>{c.reason??c.source}{c.asOf?` | ${c.asOf.slice(0,10)}`:''}</small></p>)}
         {!p&&<p>No current assessment is available for this stock.</p>}
         {s.suitability&&<small>Assessed {new Date(s.suitability.assessedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</small>}
       </div>}><button type="button" className="stock-symbol-button" aria-label={`Suitability for ${s.symbol}`}><Tag color={p?.status==='matched'?'green':p?.status==='not-matched'?'orange':'gold'}>{p?.status==='matched'?'Matches profile':p?.status==='not-matched'?'Outside profile':'Needs data'}</Tag></button></Popover>;}}]} />
   </>}]} />
 </div>;
}
