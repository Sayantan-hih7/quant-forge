import { Button, Checkbox, Form, Modal } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInput, RhfInputNumber } from '../../../components/forms';
import { defaultVolumeStyle, volumeStyleSchema, type VolumeStyle } from '../utils/volumeSettings';
import type { ChartIndicator } from '../utils/chartIndicators';

const schema=volumeStyleSchema.extend({show:z.boolean(),average:z.boolean(),period:z.number().int().min(2).max(500),maColor:z.string().regex(/^#[\da-f]{6}$/i)});
type Values=z.infer<typeof schema>;
export function VolumeSettingsModal({show,style,average,canAddAverage,onClose,onSave}:{show:boolean;style?:VolumeStyle;average?:ChartIndicator;canAddAverage:boolean;onClose:()=>void;onSave:(value:{show:boolean;style:VolumeStyle;average?:ChartIndicator})=>void}) {
  const {control,handleSubmit,setValue}=useForm<Values>({resolver:zodResolver(schema),defaultValues:{...defaultVolumeStyle,...style,show,average:!!average&&average.visible!==false,period:average?.period??9,maColor:average?.color??'#c58822'}});
  const values=useWatch({control});
  return <Modal open title="Volume settings" footer={null} onCancel={onClose} width={480}>
    <Form layout="vertical" onFinish={handleSubmit(v=>{onSave({show:v.show,style:{upColor:v.upColor,downColor:v.downColor,opacity:v.opacity},average:v.average||average?{...average,id:average?.id??crypto.randomUUID(),kind:'volumeSma',period:v.period,color:v.maColor,timeframe:'chart',visible:v.average}:undefined});onClose();})}>
      <Form.Item><Checkbox checked={values.show} onChange={e=>setValue('show',e.target.checked)}>Show volume bars</Checkbox></Form.Item>
      <div className="chart-settings-grid"><RhfInput name="upColor" control={control} type="color" label="Up candle volume"/><RhfInput name="downColor" control={control} type="color" label="Down candle volume"/></div>
      <RhfInputNumber name="opacity" control={control} label="Bar opacity (%)" min={10} max={100}/>
      <Form.Item><Checkbox checked={values.average} disabled={!canAddAverage&&!average} onChange={e=>setValue('average',e.target.checked)}>Show volume moving average</Checkbox></Form.Item>
      {values.average&&<div className="chart-settings-grid"><RhfInputNumber name="period" control={control} label="Volume MA period" min={2} max={500} precision={0}/><RhfInput name="maColor" control={control} label="Volume MA colour" type="color"/></div>}
      {!canAddAverage&&!average&&<p className="muted">Remove a chart indicator to make room for the volume average.</p>}
      <p className="muted">The average uses volume from the chart’s candle interval. The toolbar Volume switch controls these same bars and their average.</p>
      <Button type="primary" htmlType="submit">Apply volume settings</Button>
    </Form>
  </Modal>;
}
