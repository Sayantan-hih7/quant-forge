import { Button, Skeleton, Tabs } from 'antd';
import { ExperimentOutlined, SlidersOutlined, RadarChartOutlined } from '@ant-design/icons';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQualification } from '../../qualification/hooks/useQualification';
import { TradingStrategyEditor } from '../components/TradingStrategyEditor';
import { BacktestingWorkspace } from '../../backtesting/pages/BacktestingPage';
import '../../../styles/strategy-studio.css';

export default function StrategiesPage() {
  const { owner, workspace, cache } = useQualification();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  if (!workspace) return <Skeleton active />;
  if (params.get('tab') === 'runner') return <Navigate to="/signal-runner" replace />;
  const tab = params.get('tab') === 'backtests' ? 'backtests' : 'rules';
  const requested = params.get('rule') ?? workspace.selectedTacticalId;
  const linkedPlan = workspace.tradingPlans?.find((plan) => plan.id === requested || plan.exitRuleId === requested);
  const selected = linkedPlan?.entryRuleId ?? requested;
  const select = (id: string) => setParams({ tab: 'rules', rule: id });
  const backtest = (id: string) => setParams({ tab: 'backtests', strategy: id });
  return <div className="strategy-page page-enter"><div className="page-heading"><div><h1>Algo strategies</h1><p>Build buy and sell rules, use AI when you need help, then backtest the strategy.</p></div><Button icon={<RadarChartOutlined aria-hidden />} onClick={() => navigate('/signal-runner')}>Signal runner</Button></div>
    <Tabs className="strategy-tabs" destroyOnHidden activeKey={tab} onChange={(value) => { const next = new URLSearchParams(params); next.set('tab', value); if (value === 'backtests' && workspace.templates.some((rule) => rule.id === selected && rule.side === 'BUY')) next.set('strategy', selected); setParams(next); }} items={[
      { key: 'rules', label: <><SlidersOutlined aria-hidden /> Trading rules</>, children: <TradingStrategyEditor key={`${owner}:${selected}`} owner={owner} workspace={workspace} selected={selected} onSelect={select} onBacktest={backtest} /> },
      { key: 'backtests', label: <><ExperimentOutlined aria-hidden /> Backtests</>, children: <BacktestingWorkspace key={`${owner}:${params.get('strategy') ?? ''}`} owner={owner} workspace={workspace} cache={cache} embedded /> },
    ]} />
  </div>;
}
