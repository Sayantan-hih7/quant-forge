import { App, Button, Empty, Form, Modal, Table, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInputNumber } from '../../../components/forms';
import { useSignalMonitorStore } from '../../signals/store/signalMonitorStore';
import { clockLabel } from '../../signals/utils/monitoring';
import { confirmPaperSignal, paperSignalProblem } from '../utils/paperSignals';
import { maxPaperQuantity } from '../store/paperTradingStore';
import type { MonitorSignal } from '../../signals/types/monitor';
import type { PaperSession } from '../types';

const schema = z.object({ quantity: z.number().int().positive('Enter a positive whole quantity.') });
function ConfirmSignal({ owner, session, signal, close }: { owner: string; session: PaperSession; signal: MonitorSignal; close: () => void }) {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { quantity: signal.side === 'BUY' ? Math.max(1, maxPaperQuantity(session, signal.symbol)) : session.positions.find(position => `${session.id}:${position.id}` === signal.positionId)?.quantity ?? 1 } });
  const { message } = App.useApp();
  return <Modal open title={`Confirm paper ${signal.side.toLowerCase()} · ${signal.symbol}`} onCancel={close} footer={null}><p>This records a simulated fill in this session. No broker order is sent.</p><Form layout="vertical" onFinish={form.handleSubmit(({ quantity }) => { const problem = confirmPaperSignal(owner, session.id, signal.id, quantity); if (problem) form.setError('quantity', { message: problem }); else { message.success('Paper fill recorded from the alert.'); close(); } })}><RhfInputNumber control={form.control} name="quantity" label="Quantity" precision={0} min={1} disabled={signal.side === 'SELL'} /><Button type="primary" htmlType="submit">Confirm paper {signal.side.toLowerCase()}</Button></Form></Modal>;
}
export function PaperSignalInbox({ owner, session }: { owner: string; session: PaperSession }) {
  const workspace = useSignalMonitorStore(state => state.workspaces[owner]);
  const [selected, setSelected] = useState<MonitorSignal>();
  const events = workspace?.signals.filter(event => event.monitorId === session.entryRule.id && event.disposition === 'ready' && (event.side === 'BUY' || event.positionId?.startsWith(`${session.id}:`)) && !session.events.some(fill => fill.signalId === event.id)) ?? [];
  return <><p className="bt-help">Alerts come from Signal Runner. Review and confirm a paper fill here; automatic execution is not enabled.</p><Table rowKey="id" dataSource={events} size="small" scroll={{ x: 600 }} pagination={{ pageSize: 5, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fresh alerts for this session. Start its strategy in Signal Runner." /> }} columns={[{ title: 'Stock', dataIndex: 'symbol' }, { title: 'Signal', dataIndex: 'side', render: side => <Tag color={side === 'BUY' ? 'green' : 'red'}>{side}</Tag> }, { title: 'Candle · IST', dataIndex: 'candle', render: clockLabel }, { title: 'Action', render: (_, signal) => { const problem = paperSignalProblem(owner, session, signal); return <Tooltip title={problem}><span><Button size="small" disabled={!!problem} onClick={() => setSelected(signal)}>Review paper {signal.side.toLowerCase()}</Button></span></Tooltip>; } }]} />{selected && <ConfirmSignal owner={owner} session={session} signal={selected} close={() => setSelected(undefined)} />}</>;
}
