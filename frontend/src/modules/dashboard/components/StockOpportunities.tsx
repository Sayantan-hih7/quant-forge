import { useState } from 'react';
import '../../../styles/opportunities.css';
import { Alert, Button, Input, Segmented, Select, Skeleton } from 'antd';
import { ArrowRightOutlined, FilterOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../../../components/ui/Panel';
import { useDemoStore } from '../../../store/demoStore';
import { useQualification } from '../../qualification/hooks/useQualification';
import { useSignalMonitorStore } from '../../signals/store/signalMonitorStore';
import { horizonLabels } from '../../qualification/config/metrics';
import { formatMonth } from '../../strategies/utils/monthlyCycle';
import { getStockOpportunities, formatPrice } from '../utils/stockOpportunities';

import { WatchlistSidebar } from './WatchlistSidebar';
import { StockOpportunitiesTable } from './StockOpportunitiesTable';


export function StockOpportunities() {
  const { owner, workspace, cache, month } = useQualification();
  const monitoring = useSignalMonitorStore(state => state.workspaces[owner]);
  const paused = useDemoStore((state) => state.enginePaused);
  const navigate = useNavigate();
  const [selectedLayerId, setSelectedLayerId] = useState('all');
  const [horizon, setHorizon] = useState('all');
  const [risk, setRisk] = useState('all');
  const [query, setQuery] = useState('');
  if (!workspace) return <Skeleton active />;
  const opportunities = getStockOpportunities(workspace, cache, monitoring);
  const rows = opportunities.filter((row) => (selectedLayerId === 'all' || row.layerId === selectedLayerId) && (horizon === 'all' || row.horizon === horizon) && (risk === 'all' || row.risk === risk) && `${row.symbol} ${row.name} ${row.strategy}`.toLowerCase().includes(query.toLowerCase()));
  const averageUpside = rows.length ? rows.reduce((sum, row) => sum + row.upside, 0) / rows.length : 0;
  return <Panel className="stock-opportunities" title={<><span className="section-dot" /> Buy opportunities <span className="count-label">DEMO SIGNALS</span></>} extra={<Button type="link" size="small" onClick={() => navigate('/strategies?tab=rules')}>Manage rules <ArrowRightOutlined /></Button>}>
    <div className="opportunities-layout">
      <WatchlistSidebar workspace={workspace} cache={cache} opportunities={opportunities} selectedLayerId={selectedLayerId} onSelectLayer={(id) => { setSelectedLayerId(id); setHorizon('all'); }} />
      <div className="opportunities-main">
        <div className="opportunity-summary"><div><span>Ready buy alerts</span><strong className="positive">{rows.length}</strong></div><div><span>Avg. target potential</span><strong className="positive">{averageUpside.toFixed(2)}%</strong></div><div><span>Notional · 1 share per signal</span><strong>{formatPrice(rows.reduce((sum, row) => sum + row.entry, 0))}</strong></div><div className="opportunity-risk-counts">{(['Low', 'Medium', 'High'] as const).map((level) => <div key={level}><small>{level}</small><strong>{rows.filter((row) => row.risk === level).length}</strong></div>)}</div></div>
        <div className="opportunity-context"><span>{cache?.rule.name ?? 'No cache'} · {formatMonth(month, true)} · {cache?.candidates.length ?? 0} monthly candidates</span><span>Stage 2 · cached universe only</span></div>
        <div className="opportunity-toolbar"><Segmented value={horizon} onChange={setHorizon} options={[{ value: 'all', label: 'All horizons' }, ...Object.entries(horizonLabels).map(([value, label]) => ({ value, label }))]} /><Button size="small" icon={<ThunderboltOutlined />} onClick={() => { if (selectedLayerId !== 'all') { useSignalMonitorStore.getState().initialize(owner); useSignalMonitorStore.getState().select(owner, selectedLayerId); } navigate('/signal-runner'); }}>Open signal runner</Button></div>
        <div className="opportunity-filters"><Input aria-label="Search stock opportunities" placeholder="Search stock or strategy" prefix={<SearchOutlined />} value={query} allowClear onChange={(event) => setQuery(event.target.value)} /><Select aria-label="Filter demo risk" prefix={<FilterOutlined />} value={risk} options={[{ value: 'all', label: 'All risk levels' }, ...['Low', 'Medium', 'High'].map((value) => ({ value, label: `${value} · demo` }))]} onChange={setRisk} /></div>
        {paused && <Alert className="mb-3" showIcon type="warning" title="New entries paused · held-position exit checks remain available." />}
        {!cache && <Alert className="opportunity-setup-note" showIcon type="info" title="Publish this month's qualified universe to monitor new entries." action={<Button size="small" type="primary" onClick={() => navigate('/qualification')}>Open qualification</Button>} />}
        <StockOpportunitiesTable rows={rows} onReview={row => { useSignalMonitorStore.getState().select(owner, row.layerId); navigate('/signal-runner'); }} />
        <div className="opportunity-footer"><span>Illustrative prices and levels · no live orders</span><span>Review alerts in Signal Runner</span></div>
      </div>
    </div>
  </Panel>;
}
