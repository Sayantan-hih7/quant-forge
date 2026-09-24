import { Alert, App, Button, Drawer, Form } from 'antd';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput, RhfSelect } from '../../../components/forms';
import { RhfTextArea } from '../../../components/forms/RhfTextArea';
import { tradingTemplates, horizonLabels, cadenceLabels } from '../config/tradingTemplates';
import { tradingLayerSchema, type TradingLayerValues } from '../schemas/workspaceSchema';
import { formatMonth } from '../utils/monthlyCycle';
import type { MonthlyBase, TradingLayer, TradingLayerConfig } from '../types/workspace';

export function TradingLayerDrawer({ base, layer, onClose, onSave }: {
  base: MonthlyBase; layer?: TradingLayer; onClose: () => void; onSave: (config: TradingLayerConfig) => void;
}) {
  const first = tradingTemplates[0];
  const { message } = App.useApp();
  const { control, handleSubmit, setValue } = useForm<TradingLayerValues>({
    resolver: zodResolver(tradingLayerSchema), mode: 'onBlur',
    defaultValues: layer ? { name: layer.name, templateId: layer.templateId, horizon: layer.horizon, timeframe: layer.timeframe, qualificationRule: layer.qualificationRule, qualificationCadence: layer.qualificationCadence, entryRule: layer.entryRule, exitRule: layer.exitRule, mode: layer.mode } : {
      name: first.name, templateId: first.id, horizon: first.horizon, timeframe: first.timeframe, qualificationRule: first.qualificationRule, qualificationCadence: first.qualificationCadence, entryRule: first.entryRule, exitRule: first.exitRule, mode: 'PAPER',
    },
  });
  const chooseTemplate = (id: string) => {
    const template = tradingTemplates.find((item) => item.id === id)!;
    setValue('name', template.id === 'custom' ? '' : template.name, { shouldDirty: true });
    setValue('horizon', template.horizon);
    setValue('timeframe', template.timeframe);
    setValue('qualificationRule', template.qualificationRule);
    setValue('qualificationCadence', template.qualificationCadence);
    setValue('entryRule', template.entryRule);
    setValue('exitRule', template.exitRule);
  };
  const submit = (values: TradingLayerValues) => {
    onSave(values);
    message.success(layer ? 'Trading layer updated. Your monthly stock universe is unchanged.' : `Strategy attached to all ${base.current.stocks.length} qualified stocks.`);
    onClose();
  };
  return <Drawer title={layer ? 'Edit trading layer' : 'Attach a trading strategy'} open size={500} onClose={onClose}
    footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="primary" htmlType="submit" form="trading-layer-form">{layer ? 'Save trading layer' : 'Attach to entire universe'}</Button></div>}>
    <div className="attach-universe"><span className="workspace-eyebrow">REUSE SAVED UNIVERSE</span><strong>{base.name} <span>· {base.current.stocks.length} stocks</span></strong><small>{formatMonth(base.current.month)} · Snapshot v{base.current.version} · No base requalification</small></div>
    <Form id="trading-layer-form" layout="vertical" onFinish={handleSubmit(submit)} requiredMark={false}>
      <RhfSelect name="templateId" control={control} label="Strategy template" options={tradingTemplates.map((template) => ({ value: template.id, label: template.name }))} onSelect={chooseTemplate} />
      <RhfInput name="name" control={control} label="Trading layer name" placeholder="Name this strategy layer" />
      <RhfSelect name="horizon" control={control} label="Trading horizon" options={Object.entries(horizonLabels).map(([value, label]) => ({ value, label }))} />
      <div className="form-stage-heading"><span>02</span><div><h3>Qualify your watchlist</h3><p>Apply these rules only to stocks in the monthly base.</p></div></div>
      <RhfTextArea name="qualificationRule" control={control} label="Watchlist qualification rules" rows={3} maxLength={400} />
      <RhfSelect name="qualificationCadence" control={control} label="Qualification frequency" options={Object.entries(cadenceLabels).map(([value, label]) => ({ value, label }))} />
      <div className="form-stage-heading"><span>03</span><div><h3>Wait for a signal</h3><p>Entry signals must pass both the monthly base and this watchlist.</p></div></div>
      <RhfSelect name="timeframe" control={control} label="Signal timeframe" options={[{ value: '1m', label: '1-minute candle' }, { value: '5m', label: '5-minute candle' }, { value: '15m', label: '15-minute candle' }, { value: '1h', label: 'Hourly candle' }, { value: '1d', label: 'Daily candle' }, { value: '1w', label: 'Weekly candle' }, { value: '1mo', label: 'Monthly candle' }]} />
      <RhfTextArea name="entryRule" control={control} label="Entry signal" rows={2} maxLength={300} />
      <RhfTextArea name="exitRule" control={control} label="Exit signal" rows={2} maxLength={300} />
      <RhfSelect name="mode" control={control} label="Execution mode" options={[{ value: 'PAPER', label: 'Paper trading' }, { value: 'LIVE', label: 'Live · simulated' }]} />
      <Alert showIcon type="info" title="Independent qualification and signals" description="Refresh watchlist applies the horizon rules; Check signals uses only that saved watchlist. Frequency is a design setting; this demo runs manually with synthetic results and places no orders." />
    </Form>
  </Drawer>;
}
