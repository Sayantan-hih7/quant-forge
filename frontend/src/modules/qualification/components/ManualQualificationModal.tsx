import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Modal } from 'antd';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfAutoComplete, RhfInput } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import { qualifiedMember, useStockActions, type ActionStock } from '../../watchlists/hooks/useStockActions';

const schema = z.object({ search: z.string(), instrumentId: z.string().min(1, 'Choose a stock from the suggestions'), note: z.string().trim().min(1, 'Explain why you are adding this stock').max(500) });
type Fields = z.infer<typeof schema>;
export function ManualQualificationModal({ stock, onClose, onAdded }: { stock?: ActionStock; onClose: () => void; onAdded?: () => void | Promise<void> }) {
  const { membership, refresh } = useStockActions();
  const [search, setSearch] = useState(''), [options, setOptions] = useState<ActionStock[]>([]), [busy, setBusy] = useState(false), [searchError, setSearchError] = useState<string>();
  const { message } = App.useApp();
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: { search: '', instrumentId: stock?._id ?? '', note: '' } });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!search.trim()) { setOptions([]); return; }
      void apiClient.get<ActionStock[]>('/market-data/instruments', { params: { q: search }, signal: controller.signal })
        .then(response => { if (!controller.signal.aborted) { setOptions(response.data); setSearchError(undefined); } })
        .catch(error => { if (!controller.signal.aborted) setSearchError((error as Error).message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);
  async function add(values: Fields) {
    setBusy(true);
    try {
      await apiClient.post('/qualification/manual', { instrumentId: values.instrumentId, note: values.note });
      await refresh(true); await onAdded?.(); message.success('Qualified list updated'); onClose();
    } catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Add to qualification" open onCancel={busy ? undefined : onClose} closable={!busy} mask={{ closable: !busy }} footer={null}>
    <Alert className="mb-5" type="info" showIcon title="Manually added · monthly rules not verified"
      description="Your reason is saved with this stock. It becomes eligible for strategies using this month's qualified list, but buying still requires their signals and risk checks. Adding it does not place an order." />
    {!membership?.published && <Alert className="mb-5" type="warning" showIcon title="Publish your monthly qualified list first." />}
    <Form layout="vertical" onFinish={form.handleSubmit(add)}>
      {stock ? <p className="mb-5"><strong>{stock.symbol}</strong> · {stock.exchange}<br />{stock.name}</p> : <>
        <RhfAutoComplete control={form.control} name="search" label="Stock" onSearch={value => { setSearch(value); form.setValue('instrumentId', ''); }} filterOption={false}
          options={options.map(option => ({ value: `${option.symbol} · ${option.exchange}`, label: `${option.symbol} · ${option.exchange} · ${option.name}${qualifiedMember(option, membership) ? ' · Already qualified' : ''}`, id: option._id, disabled: !!qualifiedMember(option, membership) || option.active === false }))}
          onSelect={(_value, option) => form.setValue('instrumentId', String(option.id), { shouldValidate: true })} placeholder="Search a symbol or company" />
        {form.formState.errors.instrumentId && <p className="negative">{form.formState.errors.instrumentId.message}</p>}
        {searchError && <Alert type="warning" title={searchError} />}
      </>}
      <RhfInput control={form.control} name="note" label="Your reason for adding" placeholder="Your own research or qualification criteria" />
      <Button type="primary" htmlType="submit" loading={busy} disabled={!membership?.published}>Add to qualified stocks</Button>
    </Form>
  </Modal>;
}
