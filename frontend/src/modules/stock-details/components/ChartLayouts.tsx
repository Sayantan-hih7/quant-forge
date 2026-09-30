import { useState } from 'react';
import { Button, Form, Popover, Space, App } from 'antd';
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInput } from '../../../components/forms/RhfInput';
import { useChartPreferences, type ChartProfile } from '../store/chartPreferences';

const nameSchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(40) });
export function ChartLayouts({ profile, onApply }: { profile: ChartProfile; onApply: (p: ChartProfile) => void }) {
  const layouts = useChartPreferences(s => s.layouts), save = useChartPreferences(s => s.saveLayout), remove = useChartPreferences(s => s.removeLayout);
  const { control, handleSubmit, reset } = useForm({ resolver: zodResolver(nameSchema), defaultValues: { name: '' } });
  const [open, setOpen] = useState(false), { message } = App.useApp();
  return <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" title="Saved chart layouts" content={<div className="chart-layout-picker">
    <p className="muted">Your chart preferences save automatically on this device. Save a named layout to switch between setups.</p>
    {layouts.map(l => <div className="chart-indicator-row" key={l.id}><Button type="link" onClick={() => { onApply(l.profile); setOpen(false); }}>{l.name}</Button><Button type="text" aria-label={`Delete layout ${l.name}`} icon={<DeleteOutlined/>} onClick={() => remove(l.id)}/></div>)}
    {!layouts.length && <p>No saved layouts yet.</p>}
    <Form layout="vertical" onFinish={handleSubmit(({ name }) => {
      if (layouts.length >= 10 && !layouts.some(l => l.name.toLowerCase() === name.toLowerCase())) { void message.info('Remove a layout or reuse its name before saving another.'); return; }
      save(name, profile); reset(); void message.success('Chart layout saved');
    })}>
      <RhfInput name="name" control={control} label="Layout name" placeholder="e.g. Swing research" maxLength={40}/>
      <Space><Button htmlType="submit" type="primary" size="small">Save current layout</Button><span className="muted">{layouts.length}/10</span></Space>
    </Form><p className="muted">Saving an existing name replaces it. Strategy indicators remain attached to their saved rules.</p>
  </div>}><Button aria-label="Layouts" size="small" icon={<SaveOutlined/>}>Layouts</Button></Popover>;
}
