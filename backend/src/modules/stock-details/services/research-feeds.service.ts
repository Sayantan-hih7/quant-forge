import { createHttpClient } from '../../../shared/http-client.js';
import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import { AppError } from '../../../shared/errors.js';
import { redis } from '../../../shared/redis.js';
import { bseAnnouncements,bseEvents,nseAnnouncements,nseDeals,nseEvents,type ResearchItem } from '../providers/research-feeds.js';
import { ResearchCacheModel as CacheModel,type ResearchCache as Cache } from '../models/research-cache.model.js';

const client=createHttpClient(), pending=new Map<string,Promise<Cache>>();
async function cached(key:string,url:string,parse:(data:unknown)=>ResearchItem[],ttl=600_000):Promise<Cache>{
  const existing=pending.get(key);if(existing)return existing;
  const work=(async()=>{
    const saved=await CacheModel.findById(key).lean(),now=Date.now();
    if(saved&&now-Date.parse(saved.attemptedAt)<(saved.error?60_000:ttl))return saved;
    let next:Cache;
    try{
      const host=new URL(url).hostname;
      const deadline=Date.now()+4000;
      while(!await redis.set(`quantforge:research:provider:${host}`,'1','PX',1000,'NX')){
        if(Date.now()>deadline)throw new Error('Provider busy');
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      const response=await client.get(url,{timeout:15000,maxContentLength:8_000_000,headers:{'User-Agent':'Mozilla/5.0',Referer:host.includes('bseindia')?'https://www.bseindia.com/':'https://www.nseindia.com/'},...(host==='api.bseindia.com'?{insecureHTTPParser:true}:{})});
      const items=parse(response.data),at=new Date().toISOString();next={_id:key,items,fetchedAt:at,attemptedAt:at};
    }catch{next={_id:key,items:saved?.items??[],fetchedAt:saved?.fetchedAt,attemptedAt:new Date().toISOString(),error:'The exchange feed could not be refreshed. Retry shortly; any saved items keep their original dates.'};}
    await CacheModel.replaceOne({_id:key},next,{upsert:true});return next;
  })().finally(()=>pending.delete(key));pending.set(key,work);return work;
}
const isoDay=(at:number)=>new Date(at+19800000).toISOString().slice(0,10);
const nseDate=(s:string)=>`${s.slice(8)}-${s.slice(5,7)}-${s.slice(0,4)}`;
export async function stockResearchFeed(id:string,kind:'news'|'events',scope:'stock'|'market'='stock'){
  const stock=await InstrumentModel.findById(id).lean();if(!stock)throw new AppError(404,'STOCK_NOT_FOUND','Stock not found');
  const today=isoDay(Date.now()),from=isoDay(Date.now()-90*86400000),to=kind==='events'?isoDay(Date.now()+180*86400000):today;
  const feeds:Cache[]=[];
  if(kind==='news'){
    if(stock.exchange==='NSE'){
      feeds.push(await cached(`news:${id}`,`https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(stock.symbol)}&from_date=${nseDate(from)}&to_date=${nseDate(to)}`,d=>nseAnnouncements(d,stock)));
      // Share the exchange-wide deal snapshot across every stock view.
      const deals=await cached('deals:NSE','https://www.nseindia.com/api/snapshot-capital-market-largedeal',d=>{
        // Keep the raw exchange identity in each row, then filter the requested symbol below.
        nseDeals(d,stock); // Validate the envelope even when the exchange has no deals.
        const root=d as Record<string,unknown[]>;const symbols=new Set([...(root.BULK_DEALS_DATA??[]),...(root.BLOCK_DEALS_DATA??[])].map(x=>String((x as Record<string,unknown>).symbol)));
        return [...symbols].flatMap(symbol=>nseDeals(d,{...stock,symbol}));
      });feeds.push({...deals,items:deals.items.filter(x=>x.symbol===stock.symbol)});
    }else feeds.push(await cached(`news:${id}`,`https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=-1&strPrevDate=${from.replaceAll('-','')}&strScrip=${stock.securityId}&strSearch=P&strToDate=${to.replaceAll('-','')}&strType=C&subcategory=-1`,d=>bseAnnouncements(d,stock)));
  }else if(stock.exchange==='NSE'){
    feeds.push(await cached('actions:NSE',`https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=${nseDate(from)}&to_date=${nseDate(to)}`,d=>nseEvents(d,'action'),1800_000));
    feeds.push(await cached('meetings:NSE',`https://www.nseindia.com/api/corporate-board-meetings?index=equities&from_date=${nseDate(from)}&to_date=${nseDate(to)}`,d=>nseEvents(d,'meeting'),1800_000));
  }else feeds.push(await cached('actions:BSE',`https://api.bseindia.com/BseIndiaAPI/api/DefaultData/w?Fdate=${from.replaceAll('-','')}&TDate=${to.replaceAll('-','')}&ddlcategory=E&ddlindustry=&ddlPurpose=&ddlScrip=&segment=0&strSearch=S`,d=>bseEvents(d),1800_000));
  let items=feeds.flatMap(f=>f.items);
  if(kind==='events'&&scope==='stock'){
    if(stock.exchange==='BSE'){
      items=items.filter(x=>x.securityId===stock.securityId).map(x=>({...x,symbol:stock.symbol}));
    }else items=items.filter(x=>x.symbol===stock.symbol);
  }
  items=[...new Map(items.filter(x=>{const day=kind==='news'?isoDay(Date.parse(x.date)):x.date;return day>=from&&day<=to&&(kind!=='news'||Date.parse(x.date)<=Date.now());}).map(x=>[x.id,x])).values()].sort((a,b)=>kind==='news'?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
  const incomplete=feeds.some(x=>x.error),available=feeds.some(x=>x.fetchedAt);
  return {items,status:incomplete?available?'stale':'unavailable':'ready',checkedAt:new Date().toISOString(),fetchedAt:feeds.map(f=>f.fetchedAt).filter(Boolean).sort()[0]??null,from,to,today,exchange:stock.exchange,
    message:incomplete?'Some exchange data could not be refreshed. Saved records are shown where available.':undefined,
    coverage:kind==='news'?stock.exchange==='NSE'?'Announcements from the last 90 days and the latest published bulk/block deals.':'Latest BSE announcements from the last 90 days (first exchange page).':stock.exchange==='NSE'?'NSE corporate actions and board meetings. Dates can be revised by the company.':'BSE corporate actions. Board meetings are not included in this feed.'};
}
