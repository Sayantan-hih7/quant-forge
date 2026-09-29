import { App, Button, Form, Modal } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInput } from '../../../components/forms';
import { apiClient } from '../../../services/apiClient';
import type { Watchlist } from '../types';
const schema = z.object({ name: z.string().trim().min(1, 'Enter a watchlist name').max(60, 'Use up to 60 characters') });
export function WatchlistNameModal({ list, onClose, onSaved }: { list?: Watchlist; onClose: () => void; onSaved: (list: Watchlist) => void }) {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: list?.name ?? '' } });
  const [busy, setBusy] = useState(false), { message } = App.useApp();
  async function submit(values: z.infer<typeof schema>) {
    setBusy(true);
    try {
      const { data } = list ? await apiClient.patch<Watchlist>(`/watchlists/${list._id}`, values) : await apiClient.post<Watchlist>('/watchlists', values);
      onSaved(data);
    } catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  return <Modal open title={list ? 'Rename watchlist' : 'New watchlist'} onCancel={onClose} footer={null}>
    <Form layout="vertical" onFinish={form.handleSubmit(submit)}>
      <RhfInput control={form.control} name="name" label="Watchlist name" placeholder="e.g. Swing ideas" autoFocus />
      <Button htmlType="submit" type="primary" loading={busy}>{list ? 'Save name' : 'Create watchlist'}</Button>
    </Form>
  </Modal>;
}
