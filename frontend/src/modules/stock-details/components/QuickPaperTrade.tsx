import { useState } from 'react';
import { Alert, Button, Drawer, Select, Space, Tooltip } from 'antd';
import { useStockResource } from '../hooks/useStockResource';
import type { StockQuote } from '../types';
import { stockMoney, stockTime } from '../utils/format';
import type { PaperData } from '../../paper-trading/hooks/useBackendPaper';
import { ManualPaperOrder } from '../../paper-trading/components/ManualPaperOrder';

export function QuickPaperTrade({instrumentId,symbol,quote,now}:{instrumentId:string;symbol:string;quote?:StockQuote;now:number}) {
 const [side,setSide]=useState<'BUY'|'SELL'>(),[sessionId,setSessionId]=useState<string>();
 const paper=useStockResource<PaperData>(side?'/paper':null,5000);
 const books=[quote?.liveDepth,quote?.depth].filter(book=>!!book).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));
 const book=books[0],age=book?now-Date.parse(book.receivedAt):Infinity;
 const fresh=age>=-3000&&age<=10000;
 const bid=book?.bids.find(level=>level.price>0&&level.quantity>0)?.price;
 const ask=book?.asks.find(level=>level.price>0&&level.quantity>0)?.price;
 const spread=bid&&ask&&ask>=bid?ask-bid:undefined;
 const positions=paper.data?.positions??[];
 const sessions=(paper.data?.sessions??[]).filter(s=>s.active&&s.mode!=='signals'&&(side==='SELL'?positions.some(p=>p.sessionId===s._id&&p.instrumentId===instrumentId&&p.quantity>0):!s.ids||s.ids.includes(instrumentId)));
 const session=sessions.find(s=>s._id===sessionId)??(sessions.length===1?sessions[0]:undefined);
 const held=positions.filter(p=>p.sessionId===session?._id);
 const blocked=paper.data?.marketOpen===false?'Market is closed. Submit during the regular cash-market session.':paper.data?.workerRunning===false?'The paper worker is offline. Start it before submitting.':paper.data?.safety?.clock&&paper.data.safety.clock.state!=='ok'?paper.data.safety.clock.message:side==='BUY'&&paper.data?.safety?.halted?'New buys are paused by the emergency entry halt.':undefined;
 const price=side==='BUY'?ask:bid;
 return <>
  <div className="stock-quick-trade" aria-label="Quick paper trading">
   <Tooltip title="Open a paper sell order. Bid is the best available buyer price."><Button className="quick-quote quick-quote-sell" aria-label={`Paper sell ${symbol}`} onClick={()=>setSide('SELL')}><strong>{stockMoney(bid)}</strong><span>SELL</span></Button></Tooltip>
   <Tooltip title="Difference between the best ask and bid"><span className="quick-spread">{spread===undefined?'--':stockMoney(spread)}<small>Spread</small></span></Tooltip>
   <Tooltip title="Open a paper buy order. Ask is the best available seller price."><Button className="quick-quote quick-quote-buy" aria-label={`Paper buy ${symbol}`} onClick={()=>setSide('BUY')}><strong>{stockMoney(ask)}</strong><span>BUY</span></Button></Tooltip>
   <Tooltip title={book?`${book.source} - ${stockTime(book.receivedAt)}. Displayed prices do not guarantee a fill.`:'No bid/ask received. Last traded price is not a substitute for the order book.'}><span className="quick-trade-note">Paper only<br/>{book?fresh?'Recent bid / ask':'Last received bid / ask':'Bid / ask unavailable'}</span></Tooltip>
  </div>
  <Drawer open={!!side} onClose={()=>setSide(undefined)} title={`${side==='SELL'?'Sell':'Buy'} ${symbol} - paper order`} size={420} destroyOnHidden>
   <Space orientation="vertical" size={16} style={{width:'100%'}}>
    <Alert type="info" showIcon title="Paper trading only" description="Uses your selected strategy session and its risk limits. Submitting a manual order pauses new automatic buys in that session; stops and targets remain active."/>
    {paper.error&&<Alert type="error" title={paper.error} action={<Button onClick={paper.retry}>Retry</Button>}/>}
    <Select aria-label="Paper trading session" placeholder={paper.loading?'Loading paper sessions...':'Choose a paper session'} loading={paper.loading} style={{width:'100%'}} value={session?._id} onChange={setSessionId}
      options={sessions.map(s=>({value:s._id,label:`${s.strategy.name} - cash ${stockMoney(s.cashPaise/100)}`}))}/>
    {!paper.loading&&!paper.error&&!sessions.length&&<Alert type="warning" title={side==='SELL'?'No held paper shares for this listing':'No eligible paper session'} description={side==='SELL'?'You can sell only shares held on this exchange in an active paper session.':'Enable paper trading for a strategy containing this qualified stock in Signal Runner first.'}/>}
    {blocked&&<Alert type="warning" title={blocked}/>}
    {session&&side&&!blocked&&<ManualPaperOrder key={`${session._id}:${side}`} sessionId={session._id} allowedIds={[instrumentId]} positions={held}
      preset={{instrumentId,side,quantity:1}} lockedStock={{instrumentId,label:`${symbol} - ${instrumentId.split(':')[0]}`}}
      referencePrice={fresh?price:undefined} refresh={async()=>{paper.retry();}} onSubmitted={()=>setSide(undefined)}/>}
   </Space>
  </Drawer>
 </>;
}
