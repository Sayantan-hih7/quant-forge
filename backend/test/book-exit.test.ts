import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protectiveBookQuote} from '../src/modules/paper-trading/services/book-exit.js';
import type {LiveQuote,LiveBook} from '../src/modules/market-feed/types/feed.types.js';
const now=Date.parse('2026-10-06T08:54:20Z');
const order={side:'SELL' as const,source:'protection' as const,createdAt:new Date(now-6000).toISOString(),eligibleAfter:new Date(now-6000).toISOString()};
const quote:LiveQuote={instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price:100,cumulativeVolume:20,at:new Date(now-60000).toISOString(),receivedAt:new Date(now-60000).toISOString(),source:'motilal',session:'s1'};
const book:LiveBook={instrumentId:'NSE:1',source:'motilal',session:'s1',receivedAt:new Date(now).toISOString(),bestBidAt:new Date(now-1000).toISOString(),bids:[{price:95,quantity:100,orders:1}],lowerCircuit:80};
test('fresh bid may execute an old triggered exit without inventing a trade tick',()=>{
 const result=protectiveBookQuote(order,quote,book,now)!;
 assert.equal(result.price,95);assert.equal(result.at,book.bestBidAt);
 assert.equal(Math.round(result.price*100*(1-0.05/100)),9495);
});
test('stale, foreign-session, missing, thin or circuit bid cannot fill',()=>{
 for(const patch of [{bestBidAt:undefined},{bestBidAt:new Date(now-6000).toISOString()},{bestBidAt:new Date(now+1).toISOString()},{session:'s2'},{lowerCircuit:null},{bids:[]},{bids:[{price:80,quantity:1,orders:null}]},{bids:[{price:95,quantity:0,orders:null}]}])assert.equal(protectiveBookQuote(order,quote,{...book,...patch},now),null);
 assert.equal(protectiveBookQuote({...order,targetIndex:0},quote,book,now),null);
 assert.equal(protectiveBookQuote({...order,side:'BUY'},quote,book,now),null);
});
