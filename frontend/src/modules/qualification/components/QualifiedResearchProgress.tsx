import { useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '../../../services/apiClient';
import { Alert, Button, Progress } from 'antd';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
interface Status {status:string;processed?:number;total?:number;symbol?:string;stage?:string;failures?:number;message?:string;finishedAt?:string}
export function QualifiedResearchProgress({visible}:{visible:boolean}) {
 const [submitting,setSubmitting]=useState(false),[submitError,setSubmitError]=useState<string>();
 const {data,error,retry}=useStockResource<Status>(visible?'/qualification/research-status':null,5000);
 const active=!!data&&['queued','running'].includes(data.status),failed=!!data&&['partial','failed'].includes(data.status);
 const start=async()=>{
  if(submitting||active)return;
  setSubmitting(true);setSubmitError(undefined);
  try {await apiClient.post('/qualification/research-refresh');retry();}
  catch(e){setSubmitError((e as Error).message);}
  finally{setSubmitting(false);}
 };
 const action=<Button icon={<ReloadOutlined aria-hidden/>} disabled={active} loading={submitting} onClick={()=>void start()}>Retry data refresh</Button>;
 if(error||!data||data.status==='idle')return <Alert className="mb-5" type={error||submitError?'warning':'info'} title="Trading suitability data" description={submitError||error||'Refresh the data used to assess trading suitability.'} action={action}/>;
 return <Alert className="mb-5" showIcon action={action} type={active?'info':failed?'warning':'success'}
  title={data.status==='queued'?'Suitability data refresh queued':active?'Updating trading suitability':failed?'Suitability data refresh needs attention':'Suitability data refresh completed'}
  description={<>
   {submitError&&<p role="alert">{submitError}</p>}
   {active?<><p>{data.status==='queued'?'Waiting for the data worker. Refresh starts automatically.':`${data.processed??0} of ${data.total??0} stocks checked${data.symbol?' - '+data.symbol:''}${data.stage?' - '+data.stage:''}`}</p>{data.status==='running'&&<Progress percent={data.total?Math.floor((data.processed??0)/data.total*100):0} size="small"/>}</>:failed?<p>{data.failures??0} data requests could not complete. {data.message} Retry here if Dhan is connected, or reconnect Dhan to retry automatically.</p>:<p>Available data has been refreshed. Suitability labels update automatically; a stock may still need more listing history.</p>}
   <small>Existing downloads are reused. Your published qualified list is unchanged.</small>
  </>}/>;
}
