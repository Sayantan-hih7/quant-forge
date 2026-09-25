import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Segmented, Skeleton } from 'antd';
import { ArrowRightOutlined, EditOutlined } from '@ant-design/icons';
import { apiClient } from '../../../services/apiClient';
import { horizonLabels } from '../../qualification/config/metrics';
import { tradingPlanSchema } from '../schemas/tradingPlanSchema';
import { blankTradingPlan } from '../utils/tradingPlans';
import type { Horizon } from '../../qualification/types';
import type { TradingPlanDraft } from '../types/tradingPlan';

export function NewStrategyDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (draft: TradingPlanDraft) => void }) {
  const [horizon, setHorizon] = useState<Horizon>('intraday'), [examples, setExamples] = useState<{ key: string; title: string; summary: string; draft: TradingPlanDraft }[]>([]), [error, setError] = useState<string>(), [loading, setLoading] = useState(true);
  useEffect(() => { if (!open) return; const controller = new AbortController(); void apiClient.get<typeof examples>('/strategies/examples', { signal: controller.signal }).then(r => { setExamples(r.data.filter(e => tradingPlanSchema.safeParse(e.draft).success)); setError(undefined); }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [open]);
  const example = examples.find(e => e.draft.entry.horizon === horizon);
  return <Modal title="Create a strategy" open={open} onCancel={onClose} footer={null} width={680}>
    <p className="muted">Choose a holding period and a starting point. Everything stays editable before you save.</p>
    <Segmented<Horizon> block className="mt-5 mb-5" aria-label="New strategy horizon" value={horizon} onChange={value => setHorizon(value)} options={Object.entries(horizonLabels).map(([value, label]) => ({ value: value as Horizon, label }))} />
    <div className="strategy-start-option"><EditOutlined aria-hidden /><div><h3>Build your own</h3><p>Start with empty buy and sell conditions. Add rules manually or ask the AI assistant.</p></div><Button onClick={() => onCreate(blankTradingPlan(horizon))}>Start from scratch</Button></div>
    {loading ? <Skeleton active /> : example && <div className="strategy-start-option"><ArrowRightOutlined aria-hidden /><div><span className="strategy-eyebrow">EDITABLE STARTER</span><h3>{example.title}</h3><p>{example.summary}</p></div><Button type="primary" onClick={() => onCreate(structuredClone(example.draft))}>Use starter</Button></div>}
    {error && <Alert type="warning" title="Starter strategies could not be loaded" description="You can still build your own strategy." />}
    <p className="strategy-footnote">Starters are examples to test, not performance recommendations. Nothing is saved or started automatically.</p>
  </Modal>;
}
