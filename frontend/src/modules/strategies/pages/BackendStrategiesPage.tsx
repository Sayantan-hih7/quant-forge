import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Popconfirm, Skeleton, Space, Tabs } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StrategyLibrary } from '../components/StrategyLibrary';
import { NewStrategyDialog } from '../components/NewStrategyDialog';
import { StrategyBuilder } from '../components/StrategyBuilder';
import { useBackendStrategies, type SavedStrategy } from '../hooks/useBackendStrategies';
import { useStrategyChatStore } from '../store/strategyChatStore';
import type { TradingPlanDraft } from '../types/tradingPlan';
import { apiClient } from '../../../services/apiClient';
import { BackendBacktests } from '../../backtesting/components/BackendBacktests';
import '../../../styles/strategy-studio.css';
import '../../../styles/strategy-workflow.css';

export default function BackendStrategiesPage() {
  const { strategies, error, loading, refresh } = useBackendStrategies();
  const [params, setParams] = useSearchParams(), navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false), [dirty, setDirty] = useState(false);
  const { conversations, update, clear } = useStrategyChatStore();
  useEffect(() => { void refresh(); }, [refresh]);
  const selected = params.get('rule') ?? params.get('strategy');
  const id = selected?.replace(/^new-/, ''), saved = strategies.find(s => s._id === id);
  const newDraft = selected?.startsWith('new-'), tab = params.get('tab') === 'backtests' && saved ? 'backtests' : 'rules';
  const open = (rule: string, nextTab = 'rules') => { setDirty(false); setParams({ tab: nextTab, rule }); };
  const create = (draft: TradingPlanDraft) => {
    const nextId = crypto.randomUUID();
    update(`backend-local:${nextId}`, { draft, messages: [], baseRevision: 0 });
    setNewOpen(false); open(`new-${nextId}`);
  };
  const localDrafts = Object.entries(conversations).filter(([key, value]) => key.startsWith('backend-local:') && value.draft && !strategies.some(s => s._id === key.slice('backend-local:'.length)));
  return <div className="strategy-page page-enter">
    {selected && <Button type="text" className="strategy-back-link" icon={<ArrowLeftOutlined aria-hidden />} onClick={() => { setDirty(false); setParams({}); }}>All strategies</Button>}
    <div className="page-heading"><div><h1>{selected ? saved?.name ?? 'New strategy' : 'Algo strategies'}</h1><p>{selected ? 'Build a buy and sell plan, then test its saved rules.' : 'Create a strategy, test it on past prices, then inspect its signals.'}</p></div><Space wrap>{!selected && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => setNewOpen(true)}>New strategy</Button>}<Button onClick={() => navigate('/signal-runner' + (saved ? `?strategy=${saved._id}` : ''))}>Signal runner</Button></Space></div>
    {error && <Alert className="mb-5" type="error" showIcon title={error} action={<Button onClick={() => void refresh()}>Retry</Button>} />}
    {loading ? <Skeleton active /> : !selected ? <>
      <StrategyLibrary strategies={strategies} onNew={() => setNewOpen(true)} onEdit={open} onTest={rule => open(rule, 'backtests')} onDuplicate={create} />
      {!!localDrafts.length && <section className="strategy-local-drafts"><h3>Unfinished drafts on this device</h3>{localDrafts.map(([key, value]) => <div key={key}><span>{value.draft?.name || 'Untitled strategy'}</span><Space><Button onClick={() => {
        const raw = key.slice('backend-local:'.length), clean = raw.replace(/^new-/, '');
        if (clean !== raw) { update(`backend-local:${clean}`, value); clear(key); }
        open(`new-${clean}`);
      }}>Continue editing</Button><Popconfirm title="Remove this local draft?" onConfirm={() => clear(key)}><Button type="text">Remove</Button></Popconfirm></Space></div>)}</section>}
    </> : !saved && !newDraft ? <Empty description="This saved strategy could not be found"><Button onClick={() => setParams({})}>Return to strategies</Button></Empty> : <>
      <Tabs activeKey={tab} onChange={next => open(selected, next)} items={[{ key: 'rules', label: 'Trading rules' }, { key: 'backtests', label: 'Backtests', disabled: !saved || dirty }]} />
      {tab === 'rules' ? <StrategyBuilder key={id} id={id!} saved={saved} onDirtyChange={setDirty} onBacktest={() => open(id!, 'backtests')} onSave={async (draft, expectedRevision) => {
        const response = await apiClient.put<SavedStrategy>(`/strategies/${id}`, { draft, expectedRevision });
        const record = response.data;
        useBackendStrategies.setState(state => ({ strategies: [record, ...state.strategies.filter(s => s._id !== record._id)] }));
        setParams({ tab: 'rules', rule: record._id }, { replace: true });
        return record;
      }} /> : saved && <BackendBacktests key={saved._id} strategies={[saved]} selected={saved._id} />}
      {tab === 'rules' && dirty && <p className="strategy-footnote">Save your changes to enable Backtests. Your draft stays on this device when you return to the list.</p>}
    </>}
    <NewStrategyDialog open={newOpen} onClose={() => setNewOpen(false)} onCreate={create} />
  </div>;
}
