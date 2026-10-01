import { useState } from 'react';
import { Alert, Button, Empty, Input, Modal, Pagination, Segmented, Skeleton, Space, Tag } from 'antd';
import { CalendarOutlined, ExportOutlined, FileTextOutlined } from '@ant-design/icons';
import { useStockResource } from '../hooks/useStockResource';
import { stockMoney, stockTime } from '../utils/format';
import { StockNewsCoverage } from '../../news/components/StockNewsCoverage';
export interface ResearchItem {id:string;symbol:string;company:string;date:string;title:string;description:string;kind:'announcement'|'bulk'|'block'|'action'|'meeting';source:'NSE'|'BSE';url:string;dateLabel?:string;recordDate?:string;side?:'BUY'|'SELL';quantity?:number;price?:number}
export interface ResearchFeed {items:ResearchItem[];status:'ready'|'stale'|'unavailable';message?:string;coverage:string;fetchedAt:string|null;today:string;from:string;to:string;exchange:string}
function safeUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&['nsearchives.nseindia.com','www.nseindia.com','www.bseindia.com'].includes(u.hostname)?u.href:undefined;}catch{return undefined;}}
export function Feed({instrumentId,kind,market=false,path}:{instrumentId?:string;kind:'news'|'events';market?:boolean;path?:string}){
  const resource=useStockResource<ResearchFeed>(path??`/stocks/${encodeURIComponent(instrumentId??'')}/${kind}${market?'?scope=market':''}`);
  const [filter,setFilter]=useState(kind==='events'?'upcoming':'all'),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const data=resource.data,events=kind==='events';
  const items=(data?.items??[]).filter(x=>(!search||`${x.symbol} ${x.company} ${x.title} ${x.description}`.toLowerCase().includes(search.toLowerCase()))&&(filter==='all'||filter==='announcement'?filter==='all'||x.kind==='announcement':filter==='deals'?['bulk','block'].includes(x.kind):filter==='upcoming'?x.date.slice(0,10)>=(data?.today??''):x.date.slice(0,10)<(data?.today??''))).sort((a,b)=>filter==='past'?b.date.localeCompare(a.date):0);
  const current=Math.min(page,Math.max(1,Math.ceil(items.length/20)));
  return <div className="research-feed">
    <div className="stock-section-heading"><div><h3>{market?'Events across the exchange':events?'Company events':'Exchange filings & deals'}</h3><p className="muted">{events?'Corporate dates to keep in view':'Exchange filings and reported transactions'}</p></div><Button size="small" onClick={resource.retry} loading={resource.loading}>Refresh</Button></div>
    <div className="research-feed-filters"><Segmented aria-label={events?'Event period':'News type'} value={filter} onChange={v=>{setFilter(v);setPage(1);}} options={events?[{label:'Upcoming',value:'upcoming'},{label:'Recent past',value:'past'}]:[{label:'All',value:'all'},{label:'Announcements',value:'announcement'},{label:'Bulk / block deals',value:'deals'}]}/><Input.Search allowClear placeholder={market?'Search company or event':'Search these updates'} aria-label="Search updates" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div>
    {(resource.error||data?.status==='unavailable'||data?.status==='stale')&&<Alert type="warning" showIcon title={data?.status==='stale'?'Showing saved exchange updates':'Exchange updates are unavailable'} description={resource.error||data?.message||'Retry to load this feed.'}/>}
    {resource.loading&&!data?<Skeleton active paragraph={{rows:5}}/>:!items.length?<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={resource.error||!data||data.status!=='ready'?'Unable to confirm whether updates are available.':search?'No updates match your search.':events?filter==='upcoming'?'No upcoming events reported in this date range.':'No past events reported in this date range.':'No matching exchange updates in this feed.'}/>:<div className="research-feed-items">{items.slice((current-1)*20,current*20).map(x=><article key={x.id} className="research-feed-item">
      <div className="research-feed-meta"><Tag>{x.source} · {x.kind==='announcement'?'Announcement':x.kind==='action'?'Corporate action':x.kind==='meeting'?'Board meeting':`${x.kind} deal`}</Tag><span>{events?`${x.dateLabel??'Date'} · ${x.date}`:stockTime(x.date)}</span></div>
      {market&&<p className="research-event-company">{x.symbol} <span className="muted">{x.company}</span></p>}
      <h4>{x.title}</h4>
      {x.side&&<p className={x.side==='BUY'?'positive':'negative'}><strong>{x.side==='BUY'?'Bought':'Sold'} {x.quantity?.toLocaleString('en-IN')} shares</strong> at an average {stockMoney(x.price)}</p>}
      {x.description&&<p>{x.description}</p>}
      {x.recordDate&&<p className="muted">Record date · {x.recordDate}</p>}
      {safeUrl(x.url)&&<a href={safeUrl(x.url)} target="_blank" rel="noreferrer"><FileTextOutlined/> View exchange source <ExportOutlined/></a>}
    </article>)}</div>}
    {items.length>20&&<Pagination current={current} pageSize={20} total={items.length} showSizeChanger={false} onChange={setPage} showTotal={n=>`${n} updates`}/>}
    {data&&<div className="research-feed-footnote"><p>{data.coverage}</p><p>Window: {data.from} – {data.to}{data.fetchedAt?` · Fetched ${stockTime(data.fetchedAt)}`:''}</p></div>}
    {!events&&<p className="stock-chart-note">Exchange disclosures, not an editorial news feed. A reported purchase or sale describes a transaction; it is not a recommendation.</p>}
  </div>;
}
export function StockResearchFeed({instrumentId,kind}:{instrumentId:string;kind:'news'|'events'}){
  const [calendar,setCalendar]=useState(false);
  return <section className="stock-research-section">{kind==='news'&&<StockNewsCoverage instrumentId={instrumentId}/>}<Feed key={`${instrumentId}:${kind}`} instrumentId={instrumentId} kind={kind}/>{kind==='events'&&<>
    <Button block className="research-calendar-link" icon={<CalendarOutlined/>} onClick={()=>setCalendar(true)}>Explore upcoming events in other stocks</Button>
    <Modal open={calendar} onCancel={()=>setCalendar(false)} title={<Space><CalendarOutlined/>Exchange events calendar</Space>} width={850} footer={null} destroyOnHidden>{calendar&&<Feed key={instrumentId} instrumentId={instrumentId} kind="events" market/>}</Modal>
  </>}</section>;
}
