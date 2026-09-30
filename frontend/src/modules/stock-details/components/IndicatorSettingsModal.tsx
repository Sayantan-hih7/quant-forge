import { Alert, Button, Checkbox, Form, Input, Modal } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfSelect, RhfInput, RhfInputNumber } from '../../../components/forms';
import { type ChartIndicator } from '../utils/chartIndicators';
import { calculationSettings, indicatorCatalog, indicatorName, type CalculationSettings } from '../utils/indicatorCatalog';
import { indicatorSettingsSchema, type IndicatorForm } from '../utils/indicatorSettings';
import { frameOptions } from '../utils/chartTime';
import { IndicatorOptionsFields } from './IndicatorOptionsFields';

export function IndicatorSettingsModal({ indicator, onSave, onClose, adding = false }: { indicator: ChartIndicator; onSave: (i: ChartIndicator) => void; onClose: () => void; adding?: boolean }) {
  const { control, handleSubmit, setValue, formState } = useForm<IndicatorForm>({ resolver: zodResolver(indicatorSettingsSchema), defaultValues: { lineWidth: 1, crossDirection: 'both', ...indicator } });
  const value = useWatch({ control }) as IndicatorForm, definition = indicatorCatalog[indicator.kind];
  const update = (s: CalculationSettings) => {
    for (const key of Object.keys(definition.settings) as (keyof CalculationSettings)[]) setValue(key, s[key] as never, { shouldDirty: true, shouldValidate: true });
  };
  return <Modal open title={`${indicatorName(indicator.kind)} settings`} onCancel={onClose} footer={null} width={560}>
    <Form layout="vertical" onFinish={handleSubmit(v => { onSave(v); onClose(); })}>
      <p className="muted">Saved for your charts. These settings do not edit a trading strategy.</p>
      <div className="chart-settings-grid">
        {definition.period!==null && <RhfInputNumber name="period" control={control} label={['atrBands','supertrend'].includes(indicator.kind)?'ATR period':['stochRsi','connorsRsi'].includes(indicator.kind)?'RSI period':indicator.kind==='adx'?'DI period':'Period (candles)'} min={2} max={500} precision={0}/>}
        <RhfSelect virtual={false} name="timeframe" control={control} label="Calculate on" options={[{value:'chart',label:'Chart timeframe'},...frameOptions]}/>
      </div>
      <IndicatorOptionsFields kind={indicator.kind} period={value.period} value={calculationSettings(indicator.kind,value)} onChange={update} prefix="chart-indicator" chart/>
      {indicator.kind==='maCross' && <><Checkbox checked={value.showCrosses!==false} onChange={e=>setValue('showCrosses',e.target.checked)}>Show completed-candle crossover markers</Checkbox><RhfSelect name="crossDirection" control={control} label="Mark crossovers" options={[{value:'both',label:'Above and below'},{value:'above',label:'Crosses above only'},{value:'below',label:'Crosses below only'}]}/></>}
      <div className="chart-settings-grid"><RhfInput name="color" control={control} label="Line colour" type="color"/><RhfSelect virtual={false} name="lineWidth" control={control} label="Line thickness" options={[1,2,3,4].map(v=>({value:v,label:`${v} px`}))}/></div>
      {definition.lines.length>1 && <fieldset className="indicator-line-settings"><legend>Visible lines & colours</legend>{definition.lines.map((label,index)=><div className="indicator-line-setting" key={label}><Checkbox checked={value.lineStyles?.[index]?.visible!==false} onChange={e=>setValue('lineStyles',{...value.lineStyles,[index]:{...value.lineStyles?.[index],visible:e.target.checked}})}>{label}</Checkbox><Input aria-label={`${label} colour`} type="color" value={value.lineStyles?.[index]?.color??(index===1?'#c58822':value.color)} onChange={e=>setValue('lineStyles',{...value.lineStyles,[index]:{...value.lineStyles?.[index],color:e.target.value}})}/></div>)}</fieldset>}
      {Object.keys(formState.errors).length>0 && <Alert type="error" showIcon title={Object.values(formState.errors).map(e=>e?.message).filter(Boolean).join(' · ')}/>}
      {definition.description && <p className="muted">{definition.description}</p>}
      {indicator.kind==='relativeStrength'&&<p className="muted">Requires matching benchmark history. Available on daily, weekly and monthly candles.</p>}
      <p className="muted">Other timeframes use completed candles. Missing history is reported rather than estimated.</p>
      <Button htmlType="submit" type="primary">{adding?'Add to chart':'Apply indicator settings'}</Button>
    </Form>
  </Modal>;
}
