import { GuidanceNote } from '../../../components/feedback/GuidanceNote';
import { StrategyHistoryButton } from '../../strategies/components/StrategyHistoryButton';
import { App, Button, Form } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfSelect, RhfInputNumber } from '../../../components/forms';
import { useQualifiedStockScope } from '../../strategies/hooks/useQualifiedStockScope';
import { QualifiedStockPicker } from '../../strategies/components/QualifiedStockPicker';
import { apiClient } from '../../../services/apiClient';
import type { PaperSession } from '../hooks/useBackendPaper';
const schema=z.object({dailyLossLimitPercent:z.number().min(0.1).max(10),maxEntryDeviationPercent:z.number().min(0.1).max(10),ids:z.array(z.string()).min(1).max(200),mode:z.enum(['signals','confirmation','automatic'])});
export function MonitoringSettings({session,onSaved}:{session:PaperSession;onSaved:()=>Promise<void>}){
 const {message}=App.useApp(),scope=useQualifiedStockScope({universe:'current',includeManual:true});
 const form=useForm<z.infer<typeof schema>>({resolver:zodResolver(schema),defaultValues:{dailyLossLimitPercent:session.dailyLossLimitPercent??2,maxEntryDeviationPercent:session.maxEntryDeviationPercent??2,ids:session.scope?.eligibleIds??session.ids??[],mode:session.mode}});
 return <Form layout="vertical" onFinish={form.handleSubmit(async input=>{try{await apiClient.patch(`/paper/sessions/${session._id}/configuration`,input);await onSaved();message.success('Monitoring settings saved. New settings apply to upcoming signals.');}catch(e){message.error((e as Error).message);}})}>
  <p><strong>{session.strategy.name}</strong> · Saved rules, revision {session.strategy.revision}</p>
  <StrategyHistoryButton strategy={session.strategy} context="This monitoring session" /><p className="muted">These settings keep the rules used when monitoring started. To use edited strategy rules, stop this session after closing its positions and start monitoring the updated strategy.</p>
  <GuidanceNote className="mb-5" showIcon type="info" title="Update future monitoring" description="Changing the stock list does not sell held positions. They retain their exit rules. Switching to automatic mode applies to new signals; existing confirmation requests still need your approval."/>
  <Controller name="ids" control={form.control} render={({field,fieldState})=><QualifiedStockPicker {...scope} value={field.value} onChange={field.onChange} validationError={fieldState.error?.message} onRetry={scope.retry}/>}/>
  <RhfSelect control={form.control} name="mode" label="When rules match" options={[{value:'signals',label:'Show signals only'},{value:'confirmation',label:'Paper trade after I confirm'},{value:'automatic',label:'Paper trade automatically'}]}/>
  <RhfInputNumber control={form.control} name="dailyLossLimitPercent" label="Daily equity loss limit (%)" min={0.1} max={10}/><p className="muted">Measured from the first fresh portfolio valuation each trading day. Includes realized and open P&amp;L after that baseline; restarting preserves it. Reaching the limit blocks new buys for the day, while exits continue.</p>
  <RhfInputNumber control={form.control} name="maxEntryDeviationPercent" label="Maximum entry-price move from signal (%)" min={0.1} max={10}/><p className="muted">New entries beyond this distance are rejected. Protective and manual exits are never blocked by this price-move limit.</p>
  <p>Quantities are calculated from available cash, the initial stop and saved risk limits. No backtest winner ranking is applied.</p>
  <Button type="primary" htmlType="submit" loading={form.formState.isSubmitting} disabled={scope.loading||!!scope.error}>Save monitoring settings</Button>
 </Form>;
}
