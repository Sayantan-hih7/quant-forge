import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CandleBuilder} from '../src/modules/market-feed/services/candle-builder.js';
import type {LiveQuote} from '../src/modules/market-feed/types/feed.types.js';
import {protectiveTrigger} from '../src/modules/paper-trading/services/protection.js';
import type {PaperPosition} from '../src/modules/paper-trading/models/paper.model.js';
import type {Risk} from '../src/modules/strategies/validations/strategy.validation.js';
test('tick candles discard startup fragments, preserve every intraminute extreme, and reject gaps',()=>{
  const builder=new CandleBuilder(),start=Date.parse('2026-09-23T05:00:00Z');
  const tick=(second:number,price=100):LiveQuote=>({instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price,cumulativeVolume:1000+second,at:new Date(start+second*1000).toISOString(),receivedAt:new Date(start+second*1000).toISOString(),source:'motilal',session:'one'});
  for(let second=5;second<120;second+=5)builder.tick(tick(second,second===75?110:100));
  const bars=builder.drain(start+123000);
  assert.equal(bars.length,1);assert.equal(bars[0].high,110);assert.equal(bars[0].volume,60);
  builder.tick(tick(150));builder.tick(tick(155));builder.tick(tick(185));
  assert.equal(builder.drain(start+245000).length,0);
});
test('trailing exits see a high and reversal inside one worker batch',()=>{
  const at=Date.parse('2026-09-23T05:00:00Z');
  const position:PaperPosition={_id:'p',sessionId:'s',instrumentId:'NSE:1',symbol:'TEST',quantity:1,entryPaise:10000,costPaise:10000,stopPaise:9900,targetPaise:20000,openedAt:new Date(at).toISOString()};
  const risk={stopMode:'trailing',stopPercent:1} as Risk;
  const quotes=[100,110,108,111].map((price,index):LiveQuote=>({instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price,at:new Date(at+index*1000).toISOString(),receivedAt:new Date(at+index*1000).toISOString(),source:'motilal',session:'one',cumulativeVolume:index}));
  const result=protectiveTrigger(position,risk,quotes,false);
  assert.equal(result.reason,'Stop loss');assert.equal(result.quote?.price,108);assert.equal(result.stop,10890);
});
