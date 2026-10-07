import { useState, type ReactNode } from 'react';
import { Button, Checkbox, Collapse, Empty, Popover, Select, Space, Switch, Tabs } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, SettingOutlined } from '@ant-design/icons';
import { useTerminalPreferences } from '../store/terminalPreferences';
import { StockChartPanel, type StockChartPanelProps } from './StockChartPanel';
import { StockOverviewChart } from './StockOverviewChart';
import type { OverviewPeriod } from '../utils/overviewRange';
import { StockTechnicals } from './StockTechnicals';
import { StockResearchFeed } from './StockResearchFeed';
import { StockFinancials } from './StockFinancials';

export function StockMonitoringChart(props: StockChartPanelProps & {overviewContent?:ReactNode;tradeContent?:ReactNode;qualificationContent?:ReactNode;relatedContent?:ReactNode;quoteContent?:ReactNode;quickTradeContent?:ReactNode}) {
  const [choice, setChoice] = useState(() => ({ view: props.strategy || props.events?.length || props.levels?.length || props.focusEventId ? 'advanced' : 'overview', focusEventId: props.focusEventId }));
  const [panelOpen,setPanelOpen]=useState(true);
  const preferences=useTerminalPreferences();
  const research=preferences.section;
  const setResearch=(section:string)=>preferences.configure({section});
  const [period, setPeriod] = useState<OverviewPeriod>('today');
  const view = props.focusEventId && props.focusEventId !== choice.focusEventId ? 'advanced' : choice.view;
  const setView = (value: string) => setChoice({ view: value, focusEventId: props.focusEventId });
  const items = [
      { key: 'overview', label: 'Overview', children: <StockOverviewChart {...props} period={period} onPeriodChange={setPeriod} onAdvanced={() => setView('advanced')}/> },
      { key: 'advanced', label: 'Advanced chart', children: <StockChartPanel {...props}/> },
      ...(props.overviewContent ? [{ key: 'company', label: 'Company', children: props.overviewContent }] : []),
      ...(props.tradeContent ? [{ key: 'trade', label: 'Trade details', children: props.tradeContent }] : []),
      ...(props.qualificationContent ? [{ key: 'qualification', label: 'Qualification', children: props.qualificationContent }] : []),
      ...(props.relatedContent ? [{ key: 'related', label: 'Related stocks', children: props.relatedContent }] : []),
      { key: 'technicals',label:'Technicals',children:<StockTechnicals instrumentId={props.instrumentId} now={props.now}/>},
      { key: 'financials', label: 'Financials', children: <StockFinancials instrumentId={props.instrumentId}/> },
      { key: 'news',label:'News',children:<StockResearchFeed instrumentId={props.instrumentId} kind="news"/>},
      { key: 'events',label:'Events',children:<StockResearchFeed instrumentId={props.instrumentId} kind="events"/>},
    ];
  const chartItems=items.slice(0,2),researchItems=items.slice(2);
  const ordered=[...researchItems].sort((a,b)=>preferences.order.indexOf(a.key)-preferences.order.indexOf(b.key));
  const visible=ordered.filter(item=>!preferences.hidden.includes(item.key));
  const selectedResearch=visible.find(item=>item.key===research)??visible[0];
  const move=(key:string,offset:number)=>{
    const order=[...preferences.order],index=order.indexOf(key),other=ordered[ordered.findIndex(item=>item.key===key)+offset];
    if(!other)return;
    const target=order.indexOf(other.key);[order[index],order[target]]=[order[target],order[index]];preferences.configure({order});
  };
  const settings=<div className="terminal-settings">
    <strong>Make this panel yours</strong><p className="muted">Choose sections and their order. Saved on this browser.</p>
    <Space><Switch aria-label="Stack sidebar sections" checked={preferences.stacked} onChange={stacked=>preferences.configure({stacked})}/>Stack sections</Space>
    <p className="muted">Open several sections together, or use the section picker.</p>
    {ordered.map((item,i)=><div className="terminal-setting-row" key={item.key}>
      <Checkbox checked={!preferences.hidden.includes(item.key)} onChange={e=>preferences.configure({hidden:e.target.checked?preferences.hidden.filter(k=>k!==item.key):[...preferences.hidden,item.key]})}>{item.label}</Checkbox>
      <Space size={2}><Button size="small" aria-label={`Move ${item.label} up`} icon={<ArrowUpOutlined/>} disabled={i===0} onClick={()=>move(item.key,-1)}/><Button size="small" aria-label={`Move ${item.label} down`} icon={<ArrowDownOutlined/>} disabled={i===ordered.length-1} onClick={()=>move(item.key,1)}/></Space>
    </div>)}
    <Button size="small" onClick={preferences.reset}>Reset panel</Button>
  </div>;
  return <div className={`stock-monitoring-chart stock-terminal ${panelOpen?'with-details':'chart-only'}`}>
    <main className="stock-terminal-main" aria-label="Chart workspace">
      {props.quickTradeContent}
      <Tabs activeKey={view} onChange={setView} tabBarGutter={20} destroyOnHidden items={chartItems}
        tabBarExtraContent={<Button size="small" aria-expanded={panelOpen} onClick={()=>setPanelOpen(v=>!v)}>{panelOpen?'Hide details':'Show details'}</Button>}/>
    </main>
    {panelOpen&&<aside className="stock-terminal-sidebar" aria-label="Stock research panel">
      {props.quoteContent}
      <div className="stock-terminal-section-picker">
        {preferences.stacked?<strong>Quick view</strong>:<Select virtual={false} aria-label="Stock details section" placeholder="Choose a section" value={selectedResearch?.key} onChange={setResearch} options={visible.map(({key,label})=>({value:key,label}))}/>}
        <Popover trigger="click" placement="bottomRight" content={settings}><Button size="small" aria-label="Customize stock sidebar" icon={<SettingOutlined/>}/></Popover>
      </div>
      <div className="stock-terminal-research">
        {!visible.length?<Empty description="No sections selected"><Button size="small" onClick={preferences.reset}>Reset panel</Button></Empty>:preferences.stacked?
          <Collapse key={visible.map(i=>i.key).join(':')} defaultActiveKey={[visible[0].key]} ghost items={visible.map(item=>({key:item.key,label:item.label,children:item.children}))}/>:
          <div key={selectedResearch?.key}>{selectedResearch?.children}</div>}
      </div>
    </aside>}
  </div>;
}
