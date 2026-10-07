import { RestoreStrategyButton } from '../components/RestoreStrategyButton';
import { StrategyDraftPreview } from '../components/StrategyDraftPreview';
import type { Horizon } from '../../qualification/types';
import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Popconfirm, Segmented, Skeleton, Space, Tabs } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StrategyHistoryButton } from '../components/StrategyHistoryButton';
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
  const {message}=App.useApp();
  const [newHorizon,setNewHorizon]=useState<Horizon>('intraday');
  const { strategies, error, loading, refresh } = useBackendStrategies();
  const [params, setParams] = useSearchParams(), navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false), [dirty, setDirty] = useState(false);
  const { conversations, update, clear } = useStrategyChatStore();
  useEffect(() => { void refresh(); }, [refresh]);
  const selected = params.get('rule') ?? params.get('strategy');
  const id = selected?.replace(/^new-/, ''), saved = strategies.find(s => s._id === id);
  const newDraft = selected?.startsWith('new-'), tab = params.get('tab') === 'backtests' && saved ? 'backtests' : 'rules';
  const editing=!!newDraft||params.get('mode')==='edit';
  const edit=(rule:string)=>{setDirty(false);setParams({tab:'rules',rule,mode:'edit'});};
  const open = (rule: string, nextTab = 'rules') => { setDirty(false); setParams({ tab: nextTab, rule }); };
  const viewSaved=()=>{if(saved){if(dirty)message.info('Showing saved rules. Your unsaved draft is kept on this device; return to Edit mode to continue.');open(saved._id);}};
  const availableHorizons=(['intraday','swing','long-term'] as Horizon[]).filter(h=>!strategies.some(s=>!s.archivedAt&&s.entry.horizon===h));
  const startNew=(horizon:Horizon)=>{setNewHorizon(horizon);setNewOpen(true);};
  const create = (draft: TradingPlanDraft) => {
    if(!availableHorizons.includes(draft.entry.horizon)){message.warning('Edit the current strategy or archive it to free this slot.');return;}
    const nextId = crypto.randomUUID();
    update(`backend-local:${nextId}`, { draft, messages: [], baseRevision: 0 });
    setNewOpen(false); open(`new-${nextId}`);
  };
  const localDrafts = Object.entries(conversations).filter(([key, value]) => key.startsWith('backend-local:') && value.draft && !strategies.some(s => s._id === key.slice('backend-local:'.length)));
  return <div className="strategy-page page-enter">
    {selected && <Button type="text" className="strategy-back-link" icon={<ArrowLeftOutlined aria-hidden />} onClick={() => { setDirty(false); setParams({}); }}>All strategies</Button>}
    <div className="page-heading"><div><h1>{selected ? saved?.name ?? 'New strategy' : 'Algo strategies'}</h1><p>{selected ? 'Build a buy and sell plan, then test its saved rules.' : 'Create a strategy, test it on past prices, then inspect its signals.'}</p></div><Space wrap>{saved&&!saved.archivedAt&&tab==='rules'&&<Button type={editing?'default':'primary'} onClick={()=>editing?viewSaved():edit(saved._id)}>{editing?'View mode':'Edit strategy'}</Button>}{saved && <StrategyHistoryButton strategy={saved} history label="Version history" />}{!selected && <Button type="primary" icon={<PlusOutlined aria-hidden />} disabled={!availableHorizons.length} onClick={() => startNew(availableHorizons[0])}>New strategy</Button>}<Button onClick={() => navigate('/signal-runner' + (saved ? `?strategy=${saved._id}` : ''))}>Signal runner</Button></Space></div>
    {error && <Alert className="mb-5" type="error" showIcon title={error} action={<Button onClick={() => void refresh()}>Retry</Button>} />}
    {loading ? <Skeleton active /> : !selected ? <>
      <StrategyLibrary strategies={strategies} onNew={startNew} onView={open} onEdit={edit} onTest={rule => open(rule, 'backtests')} onArchive={async strategy=>{try{await apiClient.post(`/strategies/${strategy._id}/archive`,{expectedRevision:strategy.revision});await refresh();message.success('Strategy archived. You can restore it from Archived strategies or create a replacement.');}catch(e){message.error((e as Error).message);}}} />
      {!!localDrafts.length && <section className="strategy-local-drafts"><h3>Unfinished drafts on this device</h3>{localDrafts.map(([key, value]) => <div key={key}><span>{value.draft?.name || 'Untitled strategy'}</span><Space><Button onClick={() => {
        const raw = key.slice('backend-local:'.length), clean = raw.replace(/^new-/, '');
        if (clean !== raw) { update(`backend-local:${clean}`, value); clear(key); }
        open(`new-${clean}`);
      }}>Continue editing</Button><Popconfirm title="Remove this local draft?" onConfirm={() => clear(key)}><Button type="text">Remove</Button></Popconfirm></Space></div>)}</section>}
    </> : !saved && !newDraft ? <Empty description="This saved strategy could not be found"><Button onClick={() => setParams({})}>Return to strategies</Button></Empty> : <>
      <Tabs activeKey={tab} onChange={next => open(selected, next)} items={[{ key: 'rules', label: 'Trading rules' }, { key: 'backtests', label: 'Backtests', disabled: !saved || dirty }]} />
      {saved&&!saved.archivedAt&&tab==='rules'&&<div className="strategy-mode-switch" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:20}}><Segmented aria-label="Strategy mode" value={editing?'edit':'view'} options={[{value:'view',label:'View mode'},{value:'edit',label:'Edit mode'}]} onChange={mode=>mode==='view'?viewSaved():edit(saved._id)} /><span className="muted">{editing?'Editing a draft. Changes apply only after saving.':'Viewing saved rules. Editing is off.'}</span></div>}
      {saved?.archivedAt&&<Alert className="mb-5" type="info" title="Archived strategy" description="This plan is read-only. Its revisions, reports and trade history are preserved. Restore it when its holding-period slot is empty." action={<RestoreStrategyButton strategy={saved} occupied={!availableHorizons.includes(saved.entry.horizon)}/>} />}
      {tab === 'rules' && saved && (!editing||saved.archivedAt) ? <section className="strategy-overview" aria-label="Saved strategy overview"><p className="muted">Read-only overview - Revision {saved.revision}. {saved.archivedAt?'Archived plan.':'Choose Edit strategy to make changes.'}</p><StrategyDraftPreview draft={saved} changed={false} saved /></section> : tab === 'rules' ? <StrategyBuilder key={id} id={id!} saved={saved} onDirtyChange={setDirty} onBacktest={() => open(id!, 'backtests')} onSave={async (draft, expectedRevision) => {
        const response = await apiClient.put<SavedStrategy>(`/strategies/${id}`, { draft, expectedRevision });
        const record = response.data;
        useBackendStrategies.setState(state => ({ strategies: [record, ...state.strategies.filter(s => s._id !== record._id)] }));
        setParams({ tab: 'rules', rule: record._id }, { replace: true });
        return record;
      }} /> : saved && <BackendBacktests key={saved._id} strategies={[saved]} selected={saved._id} initialRunId={params.get('run')??undefined} onReportClose={()=>setParams(previous=>{const next=new URLSearchParams(previous);next.delete('run');return next;},{replace:true})} />}
      {tab === 'rules' && dirty && <p className="strategy-footnote">Save your changes to enable Backtests. Your draft stays on this device when you return to the list.</p>}
    </>}
    <NewStrategyDialog key={`${newHorizon}:${newOpen}`} initialHorizon={newHorizon} allowedHorizons={availableHorizons} open={newOpen} onClose={() => setNewOpen(false)} onCreate={create} />
  </div>;
}
