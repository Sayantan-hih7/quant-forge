import { App, Button, Form, Modal } from 'antd';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RhfChoiceSelect } from '../../../components/forms/RhfChoiceSelect';
import { RhfTextArea } from '../../../components/forms/RhfTextArea';
import { mockMarket } from '../api/mockMarket';
import { useQualificationStore } from '../store/qualificationStore';
import { formatMonth } from '../../strategies/utils/monthlyCycle';
import type { CandidateStock } from '../types';

const addStocksSchema = z.object({ symbols: z.array(z.string().min(1)).min(1, 'Select at least one stock.'), note: z.string().trim().max(300, 'Keep the note within 300 characters.') });
type AddStocksForm = z.infer<typeof addStocksSchema>;

export function AddQualifiedStocksModal({ owner, month, candidates, enabled, onClose }: { owner: string; month: string; candidates: CandidateStock[]; enabled: boolean; onClose: () => void }) {
  const form = useForm<AddStocksForm>({ resolver: zodResolver(addStocksSchema), defaultValues: { symbols: [], note: '' } });
  const add = useQualificationStore((state) => state.addQualifiedStocks);
  const { message } = App.useApp();
  const included = new Set(candidates.map((stock) => stock.symbol));
  const available = mockMarket.filter((stock) => !included.has(stock.symbol));
  const submit = ({ symbols, note }: AddStocksForm) => {
    const count = add(owner, month, symbols, note);
    if (!count) { message.info('The list changed or a scan is pending. Please try again when stock edits are available.'); return; }
    message.success(`${count} ${count === 1 ? 'stock' : 'stocks'} manually added.`);
    onClose();
  };
  return <Modal open title="Add stocks to qualified list" onCancel={onClose} footer={null} width={560}>
    <p className="q-manual-help">Add stocks outside the published list for {formatMonth(month)}. They will be marked <strong>Manually added</strong> and can be removed later.</p>
    <Form layout="vertical" requiredMark={false} onFinish={form.handleSubmit(submit)}>
      <RhfChoiceSelect control={form.control} name="symbols" label="Stocks" multiple required showSearch allowClear optionFilterProp="label" placeholder="Search symbol or company" options={available.map((stock) => ({ value: stock.symbol, label: `${stock.symbol} · ${stock.name}` }))} />
      <RhfTextArea control={form.control} name="note" label="Selection note (optional)" placeholder="Why you are including these stocks · applies to all selected stocks" rows={3} maxLength={300} showCount />
      <p className="q-manual-help">Your selection may use different criteria. The platform does not evaluate these criteria or mark manual additions as having passed the monthly rules.</p>
      <p className="q-manual-help">{available.length.toLocaleString('en-IN')} stocks available · Synthetic universe. Manual additions stay in this month's list when its rules are rerun.</p>
      <div className="q-manual-actions"><Button onClick={onClose}>Cancel</Button><Button htmlType="submit" type="primary" disabled={!enabled}>Add to qualified list</Button></div>
    </Form>
  </Modal>;
}
