import {useEffect,useState} from 'react';
import {Alert,App,Button,Form,Space} from 'antd';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {RhfInputNumber,RhfSelect} from '../../../components/forms';
import {apiClient} from '../../../services/apiClient';
const schema=z.object({instrumentId:z.string().min(1,'Choose a qualified or held stock'),side:z.enum(['BUY','SELL']),quantity:z.number().int().min(1).max(1000000)});
type Values=z.infer<typeof schema>;
export function ManualPaperOrder({sessionId,allowedIds,refresh}:{sessionId:string;allowedIds?:string[];refresh:()=>Promise<void>}){
  const {message}=App.useApp(),[stocks,setStocks]=useState<{_id:string;symbol:string;exchange:string}[]>([]),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const form=useForm<Values>({resolver:zodResolver(schema),defaultValues:{instrumentId:'',side:'BUY',quantity:1}});
  useEffect(()=>{void apiClient.get<typeof stocks>('/paper/instruments').then(r=>setStocks(r.data)).catch(e=>message.error(e.message));},[sessionId,message]);
  return <Form layout="vertical" onFinish={form.handleSubmit(async values=>{try{await apiClient.post('/paper/orders',{...values,id:requestId,sessionId});message.success('Paper order queued for the next fresh quote. Automatic entries are paused.');setRequestId(crypto.randomUUID());await refresh();}catch(e){message.error((e as Error).message);}})}>
    <Space orientation="vertical" style={{width:'100%'}}><Alert type="info" showIcon title="Manual paper order" description="No money reaches the broker. Your order is checked against cash, held shares and risk limits. It waits for a subsequent fresh Motilal quote and expires after 60 seconds."/>
      <RhfSelect control={form.control} name="instrumentId" label="Session stock or held shares" showSearch optionFilterProp="label" options={stocks.filter(s=>!allowedIds||allowedIds.includes(s._id)).map(s=>({value:s._id,label:`${s.symbol} · ${s.exchange}`}))}/>
      <RhfSelect control={form.control} name="side" label="Side" options={[{value:'BUY',label:'Buy · enter'},{value:'SELL',label:'Sell · held shares only'}]}/>
      <RhfInputNumber control={form.control} name="quantity" label="Shares" min={1} precision={0}/>
      <Button type="primary" htmlType="submit" loading={form.formState.isSubmitting}>Submit paper order</Button>
    </Space>
  </Form>;
}
