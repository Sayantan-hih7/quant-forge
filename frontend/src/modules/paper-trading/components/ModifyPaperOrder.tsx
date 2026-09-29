import {App,Alert,Button,Form,Space} from 'antd';
import {useForm,useWatch} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {RhfInputNumber,RhfSelect} from '../../../components/forms';
import {apiClient} from '../../../services/apiClient';
import type {PaperOrder} from '../hooks/useBackendPaper';
const schema=z.object({orderType:z.enum(['market','limit']),limitPrice:z.number().positive().max(10000000).nullable().optional()}).superRefine((v,c)=>{if(v.orderType==='limit'&&!v.limitPrice)c.addIssue({code:'custom',path:['limitPrice'],message:'Enter a positive price'});});
type Values=z.infer<typeof schema>;
export function ModifyPaperOrder({order,symbol,onSaved}:{order:PaperOrder;symbol:string;onSaved:()=>Promise<void>}){
 const {message}=App.useApp(),form=useForm<Values>({resolver:zodResolver(schema),defaultValues:{orderType:order.limitPaise!==undefined?'limit':'market',limitPrice:order.limitPaise!==undefined?order.limitPaise/100:undefined}});
 const type=useWatch({control:form.control,name:'orderType'});
 return <Form layout="vertical" onFinish={form.handleSubmit(async values=>{try{await apiClient.patch(`/paper/orders/${order._id}`,{orderType:values.orderType,...(values.orderType==='limit'?{limitPrice:values.limitPrice}:{}),expectedEligibleAfter:order.eligibleAfter});message.success('Order updated. New automatic buys are paused.');await onSaved();}catch(e){message.error((e as Error).message);}})}>
 <Space orientation="vertical" size={16} style={{width:'100%'}}><strong>{order.side} · {symbol} · {order.quantity||'Automatic sizing'} shares</strong>
 <Alert type="info" showIcon title="Change this unfilled order" description="Your filled trades and saved strategy stay unchanged. An edit pauses new automatic buys; stops and targets stay active. The original expiry and any required confirmation still apply."/>
 <RhfSelect name="orderType" control={form.control} label="Order type" options={[{value:'market',label:'Market · next available price'},{value:'limit',label:`Limit · ${order.side==='BUY'?'this price or lower':'this price or higher'}`}]} />
 {type==='limit'&&<RhfInputNumber name="limitPrice" control={form.control} label={`${order.side==='BUY'?'Maximum buy':'Minimum sell'} price (₹)`} min={0.01} precision={2}/>}
 <p className="muted">{type==='market'?'A market order cannot guarantee an exact fill price.':'A limit order may remain unfilled if your price is not reached.'} {order.expiresAt&&`Expires ${new Date(order.expiresAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST.`}</p>
 <Button type="primary" htmlType="submit" loading={form.formState.isSubmitting}>Save order change</Button></Space></Form>;
}
