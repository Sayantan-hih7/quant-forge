import {useEffect,useRef,useState} from 'react';
import {Alert,App,Button,Form,Space} from 'antd';
import {useForm,useWatch} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {RhfInputNumber,RhfSelect} from '../../../components/forms';
import {apiClient} from '../../../services/apiClient';
import type {PaperPosition} from '../hooks/useBackendPaper';
const schema=z.object({instrumentId:z.string().min(1,'Choose a stock'),side:z.enum(['BUY','SELL']),quantity:z.number().int().min(1).max(1000000),orderType:z.enum(['market','limit']),limitPrice:z.number().positive().max(10000000).nullable().optional()}).superRefine((v,c)=>{if(v.orderType==='limit'&&!v.limitPrice)c.addIssue({code:'custom',path:['limitPrice'],message:'Enter a limit price'});});
type Values=z.infer<typeof schema>;
export function ManualPaperOrder({sessionId,allowedIds,entryLimitPrice,positions=[],refresh,preset,onSubmitted,lockedStock,referencePrice}:{lockedStock?:{instrumentId:string;label:string};referencePrice?:number;sessionId:string;allowedIds?:string[];entryLimitPrice?:number;positions?:PaperPosition[];preset?:{instrumentId?:string;side?:'BUY'|'SELL';quantity?:number};refresh:()=>Promise<void>;onSubmitted?:()=>void}){
 const {message}=App.useApp(),[stocks,setStocks]=useState<{_id:string;symbol:string;exchange:string}[]>([]),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const side=preset?.side??'BUY';
 const form=useForm<Values>({resolver:zodResolver(schema),defaultValues:{instrumentId:preset?.instrumentId??'',side,quantity:preset?.quantity??1,orderType:side==='BUY'&&entryLimitPrice!==undefined?'limit':'market',limitPrice:side==='BUY'?entryLimitPrice:undefined}});
 const values=useWatch({control:form.control}),previous=useRef({side,instrumentId:preset?.instrumentId??''});
 const held=positions.find(p=>p.instrumentId===values.instrumentId);
 useEffect(()=>{if(lockedStock)return;void apiClient.get<typeof stocks>('/paper/instruments').then(r=>setStocks(r.data)).catch(e=>message.error(e.message));},[sessionId,message,lockedStock]);
 useEffect(()=>{
  if(previous.current.side!==values.side){form.setValue('orderType','market');form.setValue('limitPrice',undefined);}
  if(previous.current.side!==values.side||previous.current.instrumentId!==values.instrumentId){form.setValue('quantity',values.side==='SELL'?(held?.quantity??1):1);}
  previous.current={side:values.side??'BUY',instrumentId:values.instrumentId??''};
 },[values.side,values.instrumentId,held?.quantity,form]);
 return <Form layout="vertical" onFinish={form.handleSubmit(async input=>{
  if(input.side==='SELL'&&(!held||input.quantity>held.quantity)){form.setError('quantity',{message:'Choose no more than your held shares'});return;}
  try{
   if(input.side==='SELL'&&input.orderType==='market'&&held?.openedAt)await apiClient.post(`/paper/positions/${encodeURIComponent(held._id)}/exit`,{id:requestId,quantity:input.quantity,expectedOpenedAt:held.openedAt});
   else await apiClient.post('/paper/orders',{...input,limitPrice:input.orderType==='limit'?input.limitPrice:undefined,id:requestId,sessionId});
   message.success('Order queued. New automatic buys are paused.');setRequestId(crypto.randomUUID());await refresh();onSubmitted?.();
  }catch(e){message.error((e as Error).message);}
 })}>
 <Space orientation="vertical" size={16} style={{width:'100%'}}><Alert type="info" showIcon title="Manual paper order" description="Market orders wait for the next fresh quote and expire after 60 seconds. Limit orders wait until your price is reached or the session cutoff. Cash, held shares and risk limits still apply."/>
 {lockedStock?<div><strong>{lockedStock.label}</strong><p>Quantity and price apply to this listing.</p></div>:<RhfSelect control={form.control} name="instrumentId" label={values.side==='SELL'?'Held stock':'Qualified stock'} showSearch optionFilterProp="label" options={stocks.filter(s=>(!allowedIds||allowedIds.includes(s._id))&&(values.side!=='SELL'||positions.some(p=>p.instrumentId===s._id))).map(s=>({value:s._id,label:`${s.symbol} · ${s.exchange}`}))}/>}
 {!lockedStock&&<RhfSelect control={form.control} name="side" label="Side" options={[{value:'BUY',label:'Buy · enter'},{value:'SELL',label:'Sell · held shares only'}]}/>}
 <RhfInputNumber control={form.control} name="quantity" label={values.side==='SELL'?`Shares to sell${held?` · ${held.quantity} held`:''}`:'Shares to buy'} min={1} max={values.side==='SELL'?held?.quantity:1000000} precision={0}/>
 {values.side==='SELL'&&held&&<Space><Button size="small" onClick={()=>form.setValue('quantity',Math.max(1,Math.floor(held.quantity/2)))}>50%</Button><Button size="small" onClick={()=>form.setValue('quantity',held.quantity)}>All {held.quantity} shares</Button></Space>}
 <RhfSelect control={form.control} name="orderType" label="Order type" options={[{value:'market',label:'Market · next available price'},{value:'limit',label:`Limit · ${values.side==='SELL'?'minimum sell price':'maximum buy price'}`}]} />
 {values.orderType==='limit'&&<RhfInputNumber control={form.control} name="limitPrice" label="Limit price (₹)" min={0.01} precision={2}/>}
 <p className="muted">Estimated value: {values.quantity&&((values.orderType==='limit'?values.limitPrice:referencePrice)??0)>0?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(values.quantity*(values.orderType==='limit'?values.limitPrice!:referencePrice!)):'Unavailable until a price is received'} (before fees). Final fills and quantity remain subject to session risk limits.</p>
 <Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={values.side==='SELL'&&!held}>{values.side==='SELL'?'Submit sell order':'Submit buy order'}</Button>
 </Space></Form>;
}
