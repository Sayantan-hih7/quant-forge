import { Form, Input, InputNumber, Select } from 'antd';
import { indicatorCatalog, type CalculationSettings, type IndicatorKind } from '../utils/indicatorCatalog';

/** One settings editor is shared by chart studies and both rule builders. */
export function IndicatorOptionsFields({ kind, value, onChange, prefix, period, chart = false, monthly = false }: {
  kind: IndicatorKind; value: CalculationSettings; onChange: (s: CalculationSettings) => void; prefix: string; period?: number; chart?: boolean; monthly?: boolean;
}) {
  return <div className="chart-settings-grid">{Object.entries(indicatorCatalog[kind].settings).filter(([key]) => chart || !['overbought','oversold','maPeriod'].includes(key)).map(([key,spec]) => {
    if ((key === 'anchorDate' || key === 'anchorTime') && value.anchor !== 'custom') return null;
    const id=`${prefix}-${key}`, current=value[key as keyof CalculationSettings] ?? (key === 'adxSmoothing' ? period ?? spec.default : spec.default);
    const change=(next: unknown)=>{const updated={...value,[key]:next};if(next===null||next==='')delete updated[key as keyof CalculationSettings];if(key==='anchor'&&next!=='custom'){delete updated.anchorDate;delete updated.anchorTime;}onChange(updated);};
    return <Form.Item key={key} label={spec.label} htmlFor={id}>
      {spec.type==='number'?<InputNumber id={id} value={current as number|undefined} min={spec.min} max={spec.max} precision={spec.integer?0:undefined} step={spec.integer?1:.01} onChange={change} style={{width:'100%'}}/>:
        spec.type==='select'?<Select id={id} value={current} virtual={false} onChange={change} options={spec.options!.filter(v=>!monthly||key!=='pivotFrame'||v==='1mo').map(v=>({value:v,label:v==='hlc3'?'HLC3 · typical price':v==='ohlc4'?'OHLC4 · average price':v==='hl2'?'HL2 · midpoint':v==='1mo'?'Monthly':v==='1w'?'Weekly':v==='1d'?'Daily':v==='custom'?'From a chosen date / time':v==='session'?'Each session':v==='week'?'Each week':v==='month'?'Each month':v.length<=4?v.toUpperCase():v[0].toUpperCase()+v.slice(1)}))}/>:
        <Input id={id} type={spec.type} value={current??''} onChange={e=>change(e.target.value)}/>}
    </Form.Item>;
  })}</div>;
}
