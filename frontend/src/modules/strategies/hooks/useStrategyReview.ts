import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import { tradingPlanSchema } from '../schemas/tradingPlanSchema';
import type { TradingPlanDraft } from '../types/tradingPlan';
import type { RuleReviewReport } from '../types/ruleReview';

export function useStrategyReview(draft: TradingPlanDraft) {
  const identity=JSON.stringify(draft),parsed=tradingPlanSchema.safeParse(draft);
  const validation=parsed.success?undefined:parsed.error.issues[0]?.message;
  const payload=parsed.success?JSON.stringify(parsed.data):undefined;
  const [attempt,setAttempt]=useState(0),[state,setState]=useState<{identity:string;report?:RuleReviewReport;error?:string}>();
  useEffect(()=>{
    if(!payload)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      void apiClient.post<RuleReviewReport>('/strategies/review',JSON.parse(payload),{signal:controller.signal}).then(({data})=>{
        if(!controller.signal.aborted){
          if(!Array.isArray(data.issues)||!Array.isArray(data.positives))throw new Error('Rule review returned an incomplete response.');
          setState({identity,report:data});
        }
      }).catch(e=>{if(!controller.signal.aborted)setState({identity,error:(e as Error).message});});
    },500);
    return()=>{clearTimeout(timer);controller.abort();};
  },[identity,payload,attempt]);
  const current=state?.identity===identity?state:undefined;
  return {identity,report:validation?undefined:current?.report,error:current?.error,validation,loading:!validation&&!current,
    retry:()=>{setState(undefined);setAttempt(n=>n+1);}};
}
