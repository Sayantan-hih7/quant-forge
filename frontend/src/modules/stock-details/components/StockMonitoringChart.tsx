import { useState, type ReactNode } from 'react';
import { Tabs } from 'antd';
import { StockChartPanel, type StockChartPanelProps } from './StockChartPanel';
import { StockOverviewChart } from './StockOverviewChart';
import type { OverviewPeriod } from '../utils/overviewRange';
import { StockTechnicals } from './StockTechnicals';
import { StockResearchFeed } from './StockResearchFeed';
import { StockFinancials } from './StockFinancials';

export function StockMonitoringChart(props: StockChartPanelProps & {overviewContent?:ReactNode;tradeContent?:ReactNode;qualificationContent?:ReactNode}) {
  const [choice, setChoice] = useState(() => ({ view: props.strategy || props.events?.length || props.levels?.length || props.focusEventId ? 'advanced' : 'overview', focusEventId: props.focusEventId }));
  const [period, setPeriod] = useState<OverviewPeriod>('today');
  const view = props.focusEventId && props.focusEventId !== choice.focusEventId ? 'advanced' : choice.view;
  const setView = (value: string) => setChoice({ view: value, focusEventId: props.focusEventId });
  return <div className="stock-monitoring-chart">
    <Tabs activeKey={view} onChange={setView} tabBarGutter={16} destroyOnHidden items={[
      { key: 'overview', label: 'Overview', children: <><StockOverviewChart {...props} period={period} onPeriodChange={setPeriod} onAdvanced={() => setView('advanced')}/>{props.tradeContent}{props.overviewContent}</> },
      { key: 'advanced', label: 'Advanced chart', children: <><StockChartPanel {...props}/>{props.tradeContent}{props.qualificationContent}</> },
      { key: 'technicals',label:'Technicals',children:<StockTechnicals instrumentId={props.instrumentId} now={props.now}/>},
      { key: 'financials', label: 'Financials', children: <StockFinancials instrumentId={props.instrumentId}/> },
      { key: 'news',label:'News',children:<StockResearchFeed instrumentId={props.instrumentId} kind="news"/>},
      { key: 'events',label:'Events',children:<StockResearchFeed instrumentId={props.instrumentId} kind="events"/>},
    ]}/>
  </div>;
}
