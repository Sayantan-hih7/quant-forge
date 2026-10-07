import { Popover, Tag } from 'antd';
import type { QualifiedStock } from '../types/backend';
export function HorizonFitTags({stock}:{stock:QualifiedStock}){
 const fit=stock.suitability,matched=fit?.profiles.filter(p=>p.status==='matched')??[],unknown=fit?.profiles.filter(p=>p.status==='unavailable').length??0;
 const content=<div style={{maxWidth:'min(390px, calc(100vw - 48px))',maxHeight:480,overflowY:'auto'}}>
   <p>Research profiles for long-only cash stocks. A match is not a buy signal or a promise of returns. Your monthly qualification and strategy rules stay separate.</p>
   {fit?.profiles.map(profile=><section key={profile.horizon} style={{marginTop:12}}>
     <strong>{profile.label}</strong> <Tag color={profile.status==='matched'?'green':profile.status==='unavailable'?'gold':'default'}>{profile.status==='matched'?'Matches profile':profile.status==='unavailable'?'Needs data':'Does not match'}</Tag>
     {profile.checks.map(check=><div key={check.label} style={{marginTop:8}}>
       <div><Tag color={check.status==='pass'?'green':check.status==='fail'?'default':'gold'}>{check.status==='pass'?'Pass':check.status==='fail'?'Outside criteria':'Unavailable'}</Tag><strong>{check.label}</strong></div>
       <div>{check.rule}{check.value!==null&&<> | Actual {check.value.toLocaleString('en-IN',{maximumFractionDigits:2})} {check.unit}</>}</div>
       <small className="muted">{check.reason??check.source}{check.asOf&&<> | As of {check.asOf.slice(0,10)}</>}</small>
     </div>)}
   </section>)}
   {!fit&&<p>Suitability data has not been assessed yet.</p>}
   {fit&&<p className="muted" style={{marginTop:12}}>Profile {fit.version} | Checked {new Date(fit.assessedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</p>}
 </div>;
 return <Popover title="Trading suitability: why?" content={content} trigger={['hover','click']} placement="left">
   <button type="button" className="stock-symbol-button" style={{textAlign:'left',fontWeight:400,whiteSpace:'normal'}} aria-label={'View trading suitability for '+(stock.instrument?.symbol??stock.instrumentId)}>
     {matched.map(profile=><Tag key={profile.horizon} color="blue">{profile.label}</Tag>)}
     {!matched.length&&<Tag color={unknown?'gold':'default'}>{unknown||!fit?'Needs data':'No profile match'}</Tag>}
     {!!matched.length&&!!unknown&&<small className="muted">{unknown} need data</small>}
   </button>
 </Popover>;
}
