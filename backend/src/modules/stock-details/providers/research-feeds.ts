import { createHash } from 'node:crypto';
import { object, numberOrNull } from '../../../shared/http-client.js';
import { invariant } from '../../../shared/errors.js';

export interface ResearchItem {
  id: string; symbol: string; company: string; date: string; title: string; description: string;
  kind: 'announcement' | 'bulk' | 'block' | 'action' | 'meeting'; source: 'NSE' | 'BSE'; url: string;
  dateLabel?: string; recordDate?: string; side?: 'BUY' | 'SELL'; quantity?: number; price?: number; securityId?: string;
}
type StockIdentity = { symbol: string; isin: string; securityId: string };
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function exchangeDate(value: unknown, timestamp = false): string | undefined {
  const raw = String(value ?? '').trim();
  const named = /^(\d{1,2})[- ]([a-z]{3})[- ](\d{4})(?:[ T](\d{2}:\d{2}:\d{2}))?/i.exec(raw);
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?)?$/.exec(raw);
  const month = named ? months.indexOf(named[2].toLowerCase()) + 1 : 0;
  const day = named && month ? `${named[3]}-${String(month).padStart(2,'0')}-${named[1].padStart(2,'0')}` : iso?.[1];
  if (!day || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) return undefined;
  const clock = named?.[4] ?? iso?.[2] ?? '00:00:00';
  const at = Date.parse(`${day}T${clock}+05:30`);
  return Number.isFinite(at) ? timestamp ? new Date(at).toISOString() : day : undefined;
}
export function sourceLink(value: unknown, fallback: string) {
  try { const u = new URL(String(value)); return u.protocol === 'https:' && ['nsearchives.nseindia.com','www.nseindia.com','www.bseindia.com'].includes(u.hostname) ? u.href : fallback; } catch { return fallback; }
}
const text = (v: unknown) => String(v ?? '').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim().slice(0,5000);
function item(value: Omit<ResearchItem,'id'>): ResearchItem { return { ...value, id: createHash('sha256').update([value.source,value.symbol,value.kind,value.date,value.title,value.description].join('|')).digest('hex').slice(0,24) }; }
export function nseAnnouncements(payload: unknown, stock: StockIdentity) {
  invariant(Array.isArray(payload), 'NSE announcements format changed');
  invariant(!payload.length||payload.some(r=>'symbol' in object(r)&&'an_dt' in object(r)),'NSE announcement fields are unavailable');
  return payload.flatMap(raw => { const r=object(raw), date=exchangeDate(r.an_dt ?? r.sort_date,true);
    if (r.symbol!==stock.symbol || r.sm_isin && r.sm_isin!==stock.isin || !date) return [];
    return [item({symbol:stock.symbol,company:text(r.sm_name),date,title:text(r.desc)||'Company announcement',description:text(r.attchmntText),kind:'announcement',source:'NSE',url:sourceLink(r.attchmntFile,'https://www.nseindia.com/companies-listing/corporate-filings-announcements')})];
  });
}
export function bseAnnouncements(payload: unknown, stock: StockIdentity) {
  const rows=object(payload).Table; invariant(Array.isArray(rows),'BSE announcements format changed');
  invariant(!rows.length||rows.some(r=>'SCRIP_CD' in object(r)&&'NEWS_DT' in object(r)),'BSE announcement fields are unavailable');
  return rows.flatMap(raw=>{const r=object(raw),date=exchangeDate(r.NEWS_DT ?? r.DT_TM,true);
    if(String(r.SCRIP_CD)!==stock.securityId||!date)return [];
    const file=String(r.ATTACHMENTNAME??''),url=/^[\w-]+\.pdf$/i.test(file)?`https://www.bseindia.com/xml-data/corpfiling/AttachLive/${file}`:r.NSUrl;
    return [item({symbol:stock.symbol,company:text(r.SLONGNAME),date,title:text(r.NEWSSUB),description:text(r.HEADLINE),kind:'announcement',source:'BSE',url:sourceLink(url,'https://www.bseindia.com/corporates/ann.html')})];
  });
}
export function nseDeals(payload: unknown, stock: StockIdentity) {
  const root=object(payload);invariant(Array.isArray(root.BULK_DEALS_DATA)&&Array.isArray(root.BLOCK_DEALS_DATA),'NSE deals format changed');
  return (['BULK','BLOCK'] as const).flatMap(kind=>(root[`${kind}_DEALS_DATA`] as unknown[]).flatMap(raw=>{
    const r=object(raw),date=exchangeDate(r.date,true),quantity=numberOrNull(r.qty),price=numberOrNull(r.watp),side=String(r.buySell).toUpperCase();
    if(r.symbol!==stock.symbol||!date||quantity===null||quantity<=0||price===null||price<=0||!['BUY','SELL'].includes(side))return [];
    return [item({symbol:stock.symbol,company:text(r.name),date,title:text(r.clientName),description:`${kind==='BULK'?'Bulk':'Block'} transaction reported by NSE. A transaction record is not an analyst recommendation.`,kind:kind==='BULK'?'bulk':'block',source:'NSE',url:'https://www.nseindia.com/market-data/large-deals',side:side as 'BUY'|'SELL',quantity,price})];
  }));
}
export function nseEvents(payload: unknown, kind: 'action'|'meeting', stock?: StockIdentity) {
  invariant(Array.isArray(payload),'NSE events format changed');
  invariant(!payload.length||payload.some(r=>(kind==='action'?'exDate':'bm_date') in object(r)),'NSE event dates are unavailable');
  return payload.flatMap(raw=>{const r=object(raw),symbol=text(kind==='action'?r.symbol:r.bm_symbol),date=exchangeDate(kind==='action'?r.exDate:r.bm_date);
    if(!date||!symbol||stock&&symbol!==stock.symbol)return [];
    return [item({symbol,company:text(r.comp ?? r.sm_name),date,title:text(kind==='action'?r.subject:r.bm_purpose),description:kind==='meeting'?text(r.bm_desc):'',kind,source:'NSE',dateLabel:kind==='action'?'Ex-date':'Meeting date',recordDate:exchangeDate(r.recDate),url:sourceLink(r.attachment,kind==='action'?'https://www.nseindia.com/companies-listing/corporate-filings-actions':'https://www.nseindia.com/companies-listing/corporate-filings-board-meetings')})];
  });
}
export function bseEvents(payload: unknown, stock?: StockIdentity) {
  invariant(Array.isArray(payload),'BSE corporate actions format changed');
  invariant(!payload.length||payload.some(r=>'scrip_code' in object(r)&&'Ex_date' in object(r)),'BSE event fields are unavailable');
  return payload.flatMap(raw=>{const r=object(raw),date=exchangeDate(r.Ex_date);
    if(!date||stock&&String(r.scrip_code)!==stock.securityId)return [];
    return [item({symbol:stock?.symbol??text(r.short_name),securityId:String(r.scrip_code),company:text(r.long_name),date,title:text(r.Purpose),description:'',kind:'action',source:'BSE',dateLabel:'Ex-date',recordDate:exchangeDate(r.RD_Date),url:'https://www.bseindia.com/corporates/corporate_act.aspx'})];
  });
}
