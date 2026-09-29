import { useState } from 'react';
import { Alert, App, Button, Card, Form, Popconfirm, Space, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined } from '@ant-design/icons';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { RhfSelect, RhfSwitch } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import { indexCatalog } from '../../market-data/config/indices';
import { dashboardPreferencesSchema, dashboardSectionOptions, defaultDashboardPreferences, metricOptions, type DashboardPreferences, type SavedDashboardPreferences } from '../../dashboard/config/preferences';
import type { WatchlistState } from '../../watchlists/types';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import { OrderedChoices } from './OrderedChoices';
import { DashboardLayoutPreview } from './DashboardLayoutPreview';

const indexLabels = Object.fromEntries(indexCatalog.map(index => [index.id, index.name]));
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const rowOptions = (values: number[]) => values.map(value => ({ value, label: `${value} rows` }));
export function DashboardSettingsForm({ initial, onReload }: { initial: SavedDashboardPreferences; onReload: () => void }) {
  const form = useForm<DashboardPreferences>({ resolver: zodResolver(dashboardPreferencesSchema), defaultValues: initial.settings });
  const { fields, move } = useFieldArray({ control: form.control, name: 'sections', keyName: 'fieldKey' });
  const settings = useWatch({ control: form.control }) as DashboardPreferences;
  const lists = useStockResource<WatchlistState>('/watchlists');
  const [saved, setSaved] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const enabled = (id: string) => settings.sections.some(section => section.id === id && section.visible);
  const watchlistLabels = Object.fromEntries(lists.data?.lists.map(list => [list._id, list.name]) ?? []);
  const missingLists = settings.watchlistIds.filter(id => lists.data && !lists.data.lists.some(list => list._id === id));
  async function save(values: DashboardPreferences) {
    setBusy(true); setError(undefined);
    try {
      const { data } = await apiClient.put<SavedDashboardPreferences>('/dashboard/preferences', { revision: saved.revision, settings: values });
      setSaved(data); form.reset(data.settings); message.success('Dashboard preferences saved');
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <Form layout="vertical" className="dashboard-settings-form" onFinish={form.handleSubmit(save)}>
    <div className="dashboard-settings-intro"><div><h2>Make the dashboard yours</h2><p>Choose what you see and the order you see it in. Saved for this workspace across devices.</p></div><Button type="link" disabled={form.formState.isDirty || busy} title={form.formState.isDirty ? 'Save or discard your changes first' : undefined} onClick={() => navigate('/admin/dashboard')}>View dashboard →</Button></div>
    {saved.warning && <Alert showIcon type="warning" title={saved.warning} />}
    {error && <Alert showIcon type="error" title="Preferences were not saved" description={error} action={<Popconfirm title="Reload saved settings and discard these edits?" onConfirm={onReload}><Button>Reload saved settings</Button></Popconfirm>} />}
    <div className="dashboard-settings-grid"><div className="dashboard-settings-controls">
      <Card title="Sections & order" size="small"><p className="muted">Show the sections you use. Move them up or down to set their reading order.</p><ol className="dashboard-section-order" aria-label="Dashboard section order">
        {fields.map((field, i) => { const option = dashboardSectionOptions.find(item => item.id === field.id)!; return <li key={field.fieldKey} data-section={field.id}><span className="dashboard-choice-number">{i + 1}</span><div className="dashboard-section-copy"><strong>{option.label}</strong><span>{option.description}</span></div><RhfSwitch<DashboardPreferences> control={form.control} name={`sections.${i}.visible`} label="" aria-label={`Show ${option.label}`} disabled={settings.sections.filter(section => section.visible).length === 1 && settings.sections[i].visible} /><div className="dashboard-reorder-buttons"><Button type="text" size="small" icon={<ArrowUpOutlined />} aria-label={`Move ${option.label} up`} disabled={i === 0} onClick={() => move(i, i - 1)} /><Button type="text" size="small" icon={<ArrowDownOutlined />} aria-label={`Move ${option.label} down`} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)} /></div></li>; })}
      </ol><RhfSelect control={form.control} name="density" label="Spacing" options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></Card>
      <Card title="Market overview" size="small" extra={!enabled('market') && <Tag>Section hidden</Tag>}>
        <p className="muted">Choose up to 8 indices from either exchange. For example, search NIFTY 100 and add it to your overview.</p>
        <RhfSelect control={form.control} name="indexIds" label="Dashboard indices" mode="multiple" showSearch maxCount={8} placeholder="Search NSE or BSE indices" filterOption={(input, option) => normalized(String(option?.label ?? '')).includes(normalized(input))} options={['NSE', 'BSE'].map(exchange => ({ label: exchange, options: indexCatalog.filter(index => index.exchange === exchange).map(index => ({ value: index.id, label: index.name })) }))} />
        <OrderedChoices name="Selected index order" ids={settings.indexIds} labels={indexLabels} onChange={ids => form.setValue('indexIds', ids, { shouldDirty: true, shouldValidate: true })} />
        <RhfSwitch control={form.control} name="showSparklines" label="Show mini price charts" />
        <p className="muted">Indices still follow market hours and holidays. Your selection does not change their update schedule.</p>
      </Card>
      <Card title="Summary cards" size="small" extra={!enabled('summary') && <Tag>Section hidden</Tag>}>
        <RhfSelect control={form.control} name="metricIds" label="Cards to show" mode="multiple" options={[...metricOptions]} />
        <OrderedChoices name="Summary card order" ids={settings.metricIds} labels={Object.fromEntries(metricOptions.map(option => [option.value, option.label]))} onChange={ids => form.setValue('metricIds', ids as DashboardPreferences['metricIds'], { shouldDirty: true, shouldValidate: true })} />
      </Card>
      <Card title="Activity & watchlists" size="small"><div className="dashboard-settings-fields">
        <RhfSelect control={form.control} name="monitoringPageSize" label="Monitoring rows per page" options={rowOptions([5, 10, 20])} />
        <RhfSelect control={form.control} name="signalCount" label="Recent signals to show" options={rowOptions([6, 10, 20])} />
        <RhfSelect control={form.control} name="signalSide" label="Signal events" options={[{ value: 'all', label: 'Buy and sell' }, { value: 'BUY', label: 'Buy only' }, { value: 'SELL', label: 'Sell only' }]} />
        <RhfSelect control={form.control} name="backtestCount" label="Recent backtests to show" options={rowOptions([4, 8, 12])} />
      </div><RhfSelect control={form.control} name="watchlistMode" label="Dashboard watchlists" options={[{ value: 'recent', label: '5 most recently updated' }, { value: 'selected', label: 'Choose and pin watchlists' }]} />
        {settings.watchlistMode === 'selected' && <>
          <RhfSelect control={form.control} name="watchlistIds" label="Pinned watchlists" mode="multiple" maxCount={8} showSearch optionFilterProp="label" loading={lists.loading} options={[...(lists.data?.lists ?? []).map(list => ({ value: list._id, label: list.name })), ...missingLists.map(id => ({ value: id, label: 'Deleted watchlist · remove this selection' }))]} />
          <OrderedChoices name="Pinned watchlist order" ids={settings.watchlistIds} labels={watchlistLabels} onChange={ids => form.setValue('watchlistIds', ids, { shouldDirty: true, shouldValidate: true })} />
          {missingLists.length > 0 && <Alert type="warning" showIcon title="A pinned watchlist was deleted. Remove it or select another list; it will not appear on the dashboard." />}
          {!lists.loading && lists.data?.lists.length === 0 && <p className="muted">No saved watchlists yet. <Link to="/market-data/watchlists">Create a watchlist</Link>, or use the recently updated option.</p>}
          {lists.error && <Alert type="warning" title={lists.error} action={<Button onClick={lists.retry}>Retry watchlists</Button>} />}
        </>}
      </Card>
    </div><DashboardLayoutPreview settings={settings} /></div>
    <div className="dashboard-settings-actions"><div><Tag color={form.formState.isDirty ? 'orange' : 'green'}>{form.formState.isDirty ? 'Unsaved changes' : 'Saved preferences'}</Tag><span>{saved.updatedAt ? `Last saved ${new Date(saved.updatedAt).toLocaleString('en-IN')}` : 'Using the default layout'}</span></div><Space wrap>
      <Popconfirm title="Restore the default dashboard layout?" description="Review the default layout, then save to apply it." onConfirm={() => form.reset(structuredClone(defaultDashboardPreferences), { keepDefaultValues: true })}><Button icon={<ReloadOutlined aria-hidden />} disabled={busy}>Restore defaults</Button></Popconfirm>
      <Button disabled={!form.formState.isDirty || busy} onClick={() => { form.reset(saved.settings); setError(undefined); }}>Discard changes</Button>
      <Button type="primary" htmlType="submit" loading={busy} disabled={!form.formState.isDirty && !saved.warning}>Save dashboard</Button>
    </Space></div>
  </Form>;
}
