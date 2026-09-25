import { useState } from 'react';
import { Button, Empty, Input, Segmented, Space, Tag } from 'antd';
import { ArrowRightOutlined, CopyOutlined, EditOutlined, ExperimentOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { horizonLabels } from '../../qualification/config/metrics';
import { cadenceLabel } from '../utils/strategyLabels';
import type { SavedStrategy } from '../hooks/useBackendStrategies';
import type { TradingPlanDraft } from '../types/tradingPlan';

export function StrategyLibrary({ strategies, onNew, onEdit, onTest, onDuplicate }: { strategies: SavedStrategy[]; onNew: () => void; onEdit: (id: string) => void; onTest: (id: string) => void; onDuplicate: (draft: TradingPlanDraft) => void }) {
  const [query, setQuery] = useState(''), [horizon, setHorizon] = useState('all');
  const visible = strategies.filter(s => (!query || s.name.toLowerCase().includes(query.toLowerCase())) && (horizon === 'all' || s.entry.horizon === horizon));
  return <>
    <div className="strategy-journey" aria-label="Strategy workflow">
      {[['1', 'Build your rules', 'Define when to buy, sell and exit for protection.'], ['2', 'Backtest', 'Replay past prices to inspect the behaviour.'], ['3', 'Inspect signals', 'Check both sides before starting paper monitoring.']].map(([number, title, text]) => <div key={number}><b>{number}</b><section><strong>{title}</strong><p>{text}</p></section></div>)}
    </div>
    <section className="strategy-library" aria-label="Saved strategies">
      <div className="strategy-library-toolbar"><div><h2>Your strategies <span>{strategies.length}</span></h2><p>Saving a strategy does not start monitoring or place orders.</p></div><Input aria-label="Search strategies" prefix={<SearchOutlined aria-hidden />} placeholder="Search strategies" value={query} onChange={e => setQuery(e.target.value)} allowClear /></div>
      <Segmented aria-label="Filter strategies by horizon" value={horizon} onChange={setHorizon} options={[{ value: 'all', label: 'All strategies' }, ...Object.entries(horizonLabels).map(([value, label]) => ({ value, label }))]} />
      <div className="strategy-library-list">{visible.map(strategy => <article className="strategy-library-row" key={strategy._id} aria-label={strategy.name}>
        <div className="strategy-library-identity"><Tag color={strategy.entry.horizon === 'intraday' ? 'blue' : strategy.entry.horizon === 'swing' ? 'purple' : 'cyan'}>{horizonLabels[strategy.entry.horizon]}</Tag><h3><button onClick={() => onEdit(strategy._id)}>{strategy.name}<ArrowRightOutlined aria-hidden /></button></h3><p>{cadenceLabel(strategy.entry.cadence)} · {strategy.risk.overnight ? 'Overnight holding' : 'Closes within the day'} · Long only</p><small>Saved {new Date(strategy.savedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
        <div className="strategy-library-rules"><span><i className="positive">Buy</i> {strategy.entry.groups.reduce((n, g) => n + g.conditions.length, 0)} conditions</span><span><i className="negative">Sell</i> {strategy.exit.groups.reduce((n, g) => n + g.conditions.length, 0)} conditions</span><span>{strategy.risk.riskPercent}% risk · {strategy.risk.maxPositions} positions max.</span></div>
        <Space wrap><Button icon={<EditOutlined aria-hidden />} onClick={() => onEdit(strategy._id)}>Edit</Button><Button icon={<ExperimentOutlined aria-hidden />} onClick={() => onTest(strategy._id)}>Backtest</Button><Button type="text" icon={<CopyOutlined aria-hidden />} aria-label={`Duplicate ${strategy.name}`} onClick={() => onDuplicate({ name: `${strategy.name.slice(0, 42)} · Copy`, entry: structuredClone(strategy.entry), exit: structuredClone(strategy.exit), risk: structuredClone(strategy.risk) })} /></Space>
      </article>)}</div>
      {!visible.length && <Empty description={strategies.length ? 'No strategies match these filters' : 'Create your first buy and sell strategy'}>{!strategies.length && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={onNew}>Create strategy</Button>}</Empty>}
    </section>
  </>;
}
