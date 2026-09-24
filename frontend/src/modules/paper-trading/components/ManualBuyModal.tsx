import { App, Button, Form, Modal } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfInput, RhfInputNumber, RhfSelect } from '../../../components/forms';
import { money } from '../../backtesting/config/backtestDefaults';
import { maxPaperQuantity, paperQuote, usePaperTradingStore } from '../store/paperTradingStore';
import { useQualification } from '../../qualification/hooks/useQualification';
import type { PaperSession } from '../types';

const schema = z.object({ symbol: z.string().min(1, 'Select a stock.'), quantity: z.number().int().positive('Enter a positive whole quantity.'), note: z.string().max(200) });
export function ManualBuyModal({ session, owner, onClose }: { session: PaperSession; owner: string; onClose: () => void }) {
  const { cache } = useQualification();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { symbol: '', quantity: 1, note: '' } });
  const symbol = useWatch({ control: form.control, name: 'symbol' });
  const buy = usePaperTradingStore((state) => state.buyManual);
  const { message } = App.useApp();
  const submit = (values: z.infer<typeof schema>) => { const error = buy(owner, session.id, values.symbol, values.quantity, values.note); if (error) form.setError('quantity', { message: error }); else { message.success('Manual paper buy recorded.'); onClose(); } };
  return <Modal open title="Manual paper buy" onCancel={onClose} footer={null}><p className="bt-help">Bypass the buy signal using your judgment. Cash, risk, and position limits still apply. This action does not change your backtest.</p><Form layout="vertical" onFinish={form.handleSubmit(submit)}>
    <RhfSelect control={form.control} name="symbol" label="Qualified stock" showSearch optionFilterProp="label" options={session.scope.symbols.filter((stock) => cache?.candidates.some(candidate => candidate.symbol === stock.symbol) && !session.positions.some((position) => position.symbol === stock.symbol)).map((stock) => ({ value: stock.symbol, label: `${stock.symbol}${stock.manual ? ' · Manually added' : ''}` }))} />
    {symbol && <div className="bt-risk-note">Simulated price <strong>{money(paperQuote(session, symbol))}</strong><small>Maximum allowed: {maxPaperQuantity(session, symbol)} shares, including estimated buy costs.</small></div>}
    <RhfInputNumber control={form.control} name="quantity" label="Quantity" min={1} precision={0} /><RhfInput control={form.control} name="note" label="Reason (optional)" placeholder="Your reason for overriding the entry signal" maxLength={200} />
    <div className="bt-actions"><Button onClick={onClose}>Cancel</Button><Button type="primary" htmlType="submit">Confirm paper buy</Button></div>
  </Form></Modal>;
}
