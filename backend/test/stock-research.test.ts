import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nseAnnouncements,bseAnnouncements,nseEvents,bseEvents,nseDeals,exchangeDate,sourceLink } from '../src/modules/stock-details/providers/research-feeds.js';
import { parseSnapshot,parseDepth } from '../src/modules/stock-details/providers/dhan-quotes.js';
import { mergeQuote } from '../src/modules/stock-details/utils/merge-quote.js';
const stock={symbol:'EXAMPLE',isin:'INE001',securityId:'500001'},at='2026-09-30T06:00:00.000Z';
test('depth retains zero totals, discards empty price levels, and sorts both sides',()=>{
 const d=parseDepth({buy_quantity:0,sell_quantity:40,depth:{buy:[{price:0,quantity:0}],sell:[{price:105,quantity:30},{price:101,quantity:10},{price:-1,quantity:4}]}},at)!;
 assert.equal(d.totalBuy,0);assert.deepEqual(d.bids,[]);assert.deepEqual(d.asks.map(x=>x.price),[101,105]);assert.equal(parseDepth({},at),undefined);
});
test('a newer order-book snapshot survives even when a stream wins the last price',()=>{
 const quote=parseSnapshot('NSE:1',{last_price:100,last_trade_time:'30/09/2026 11:29:00',net_change:2},at)!;
 const depth=parseDepth({depth:{buy:[],sell:[]},buy_quantity:0,sell_quantity:0},'2026-09-30T06:00:01.000Z');
 const result=mergeQuote({...quote,source:'motilal-stream'},{...quote,depth,receivedAt:'2026-09-30T06:00:01.000Z'},Date.parse(at)+1000);
 assert.equal(result.source,'motilal-stream');assert.equal(result.depth?.receivedAt,depth?.receivedAt);
});
test('announcement identity and links are validated, provider text is never HTML',()=>{
 const row={symbol:'EXAMPLE',sm_isin:'INE001',an_dt:'30-Sep-2026 10:00:00',desc:'Results',attchmntText:'<b>Published</b>',attchmntFile:'javascript:alert(1)'};
 const result=nseAnnouncements([row,{...row,symbol:'OTHER'},{...row,sm_isin:'OTHER'}],stock);
 assert.equal(result.length,1);assert.equal(result[0].description,'Published');assert.equal(result[0].date,'2026-09-30T04:30:00.000Z');assert.ok(result[0].url.startsWith('https:'));
 assert.equal(bseAnnouncements({Table:[{SCRIP_CD:500001,NEWS_DT:'2026-09-30T10:00:00.123',NEWSSUB:'Results',ATTACHMENTNAME:'safe.pdf'},{SCRIP_CD:999,NEWS_DT:'2026-09-30T10:00:00'}]},stock).length,1);
 assert.throws(()=>nseAnnouncements([{message:'denied'}],stock));assert.throws(()=>bseAnnouncements({},stock));
 assert.equal(sourceLink('https://www.bseindia.com.evil.test/file','fallback'),'fallback');
});
test('corporate action and meeting dates are distinct and BSE scrip identity is preserved',()=>{
 const actions=nseEvents([{symbol:'EXAMPLE',exDate:'01-Oct-2026',recDate:'02-Oct-2026',subject:'Dividend'},{symbol:'OTHER',exDate:'03-Oct-2026'}],'action',stock);
 assert.equal(actions.length,1);assert.equal(actions[0].dateLabel,'Ex-date');assert.equal(actions[0].recordDate,'2026-10-02');
 const bse=bseEvents([{scrip_code:500001,short_name:'EXAMPLE',Ex_date:'01 Oct 2026',Purpose:'Dividend'},{scrip_code:500002,Ex_date:'01 Oct 2026'}],stock);
 assert.equal(bse.length,1);assert.equal(bse[0].securityId,'500001');
 assert.equal(nseEvents([{bm_symbol:'EXAMPLE',bm_date:'05-Oct-2026',bm_purpose:'Results'}],'meeting')[0].dateLabel,'Meeting date');
 assert.equal(exchangeDate('31-Feb-2026'),undefined);assert.throws(()=>bseEvents({error:'unavailable'}));assert.throws(()=>nseEvents([{unknown:true}],'action'));
});
test('bulk transactions preserve factual side, quantity and price without becoming recommendations',()=>{
 const rows=nseDeals({BULK_DEALS_DATA:[{symbol:'EXAMPLE',date:'29-Sep-2026',buySell:'SELL',clientName:'Fund',qty:'1,000',watp:'105.50'}],BLOCK_DEALS_DATA:[]},stock);
 assert.equal(rows[0].side,'SELL');assert.equal(rows[0].quantity,1000);assert.equal(rows[0].price,105.5);assert.match(rows[0].description,/not an analyst recommendation/);
 assert.throws(()=>nseDeals({},stock));
});
