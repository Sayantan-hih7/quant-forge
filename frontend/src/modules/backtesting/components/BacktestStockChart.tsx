import { useMemo, useState } from 'react';
import { Alert, Button, Drawer, Select, Space, Tag, Segmented } from 'antd';
import { CompressOutlined, ExpandOutlined } from '@ant-design/icons';
import { StockChartPanel } from '../../stock-details/components/StockChartPanel';
import type { BackendBacktest } from '../types/backend';
import { backtestPositionEvents, type BacktestStockResult } from '../utils/stockResults';
import { reportDate, reportMoney, reportTime } from '../utils/reportFormat';
import { BacktestTradeHistory } from './BacktestTradeHistory';
import { ReportPnl } from './ReportPnl';
import { BacktestReplayPlayer } from './BacktestReplayPlayer';
import '../../../styles/stock-details.css';
import '../../../styles/backtest-report.css';

export function BacktestStockChart({ run, stock, onClose, embedded = false }: { embedded?: boolean; run: BackendBacktest; stock: BacktestStockResult; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false), [selected, setSelected] = useState<string>();
  const [replay, setReplay] = useState(false);
  const [view, setView] = useState<'chart' | 'history'>('chart');
  const inspect = (id: string) => { setSelected(id); setView('chart'); setReplay(false); };
  const events = useMemo(() => stock.positions.flatMap(backtestPositionEvents), [stock]);
  const selectedPosition = stock.positions.find(p => selected?.startsWith(`${p.id}:`));
  const event = events.find(e => e.id === selected);
  const historyAt = new Date(run.config.to).toISOString();
  const content = (
    <div className="stock-detail-content bt-stock-workspace">
      <section className="bt-stock-summary"><Space wrap><Tag color="purple">Historical simulation</Tag><span>{reportDate(run.config.from)} – {reportDate(new Date(Date.parse(run.config.to) - 1).toISOString())}</span></Space>
        {!replay && <div className="bt-stock-metrics">
          <div><span>Period P&L</span><strong><ReportPnl value={stock.totalPnl}/></strong></div>
          <div><span>Realized / open P&L</span><strong><ReportPnl value={stock.realizedPnl}/> / <ReportPnl value={stock.unrealizedPnl}/></strong></div>
          <div><span>Trades / closed</span><strong>{stock.totalTrades} / {stock.closedTrades}</strong></div>
          <div><span>Win rate · closed trades</span><strong>{stock.winRate == null ? '—' : `${stock.winRate.toFixed(1)}%`}</strong></div>
        </div>}
      </section>
      {stock.incomplete > 0 && <Alert type="warning" showIcon title="Some saved trades have incomplete position details" description="They are excluded from the win rate. Recorded exit fills and their P&L remain visible."/>}
      <div className="bt-report-toolbar"><div><Segmented aria-label="Backtest stock view" value={replay ? 'replay' : view} options={[{ value: 'chart', label: 'Chart' }, { value: 'history', label: 'Trade history' }, ...(replay ? [{ value: 'replay', label: 'Replay' }] : [])]} onChange={value => { if (value !== 'replay') { setReplay(false); setView(value as 'chart' | 'history'); } }}/><p>{replay ? 'Select a trade to follow its signal, entry and exits.' : 'Strategy indicators are on. Select a trade or click a marker to inspect a fill.'}</p></div>
        <Space wrap><Select aria-label="Trade to inspect" className="bt-trade-select" value={selectedPosition?.id ?? 'all'}
          options={[...(!replay ? [{ value: 'all', label: 'All trades · full test period' }] : []), ...stock.positions.map((p, i) => ({ value: p.id, label: `Trade ${i + 1} · ${p.entryAt ? reportDate(p.entryAt) : 'Unknown entry date'}${replay ? '' : ` · ${p.outcome}`}`, disabled: !p.entryAt }))]}
          onChange={id => { setSelected(id === 'all' ? undefined : `${id}:entry`); setView('chart'); }}/>
          {replay ? <Button onClick={() => setReplay(false)}>Close replay</Button> : <>
            <Button type="primary" disabled={!stock.positions.some(p => p.entryAt)} onClick={() => {
              const p = selectedPosition?.entryAt ? selectedPosition : stock.positions.find(p => p.entryAt);
              if (p) { setSelected(`${p.id}:entry`); setReplay(true); }
            }}>Replay trade</Button>
            {selected && <Button size="small" onClick={() => setSelected(undefined)}>Show full period</Button>}
          </>}
        </Space>
      </div>
      <div className={`bt-stock-body ${replay ? 'bt-stock-body--replay' : view === 'history' ? 'bt-stock-body--history' : 'bt-stock-body--chart'}`}>
      {replay && selectedPosition ? <BacktestReplayPlayer run={run} instrumentId={stock.instrumentId} symbol={stock.symbol} position={selectedPosition}/> : view === 'history' ? <BacktestTradeHistory positions={stock.positions} selectedId={selectedPosition?.id} onSelectEvent={inspect}/> : <>
      <StockChartPanel compact={embedded} instrumentId={stock.instrumentId} symbol={stock.symbol} now={Date.parse(historyAt)} strategy={run.strategy} historyAt={historyAt}
        historyPath={`/backtests/${encodeURIComponent(run._id)}/stocks/${encodeURIComponent(stock.instrumentId)}/chart`} visibleRange={run.config}
        events={events} levels={selectedPosition ? [{ id: 'entry', label: 'Backtest entry', price: selectedPosition.entry, kind: 'entry' }] : []}
        focusEventId={selected} onSelectEvent={setSelected}/>
      {event && <Alert className="bt-stock-selected-fill" showIcon type="info" title={`${event.side} backtest fill · ${event.quantity} shares at ${reportMoney(event.price!)}`}
        description={`${reportTime(event.at)} · ${event.label}${selectedPosition ? ` · ${selectedPosition.quantity} initial shares` : ''}`}/>}
      </>}
      </div>
    </div>
  );
  if (embedded) return <section className={`bt-embedded-inspection ${expanded ? 'bt-embedded-inspection--expanded' : ''}`} aria-label={`${stock.symbol} trade inspection`}>
    <div className="bt-chart-focus-bar"><strong>{stock.symbol}</strong><span>Revision {run.strategy.revision} · Historical simulation</span><Button size="small" aria-label={expanded ? 'Exit chart focus' : 'Focus chart'} icon={expanded ? <CompressOutlined/> : <ExpandOutlined/>} onClick={() => setExpanded(value => !value)}>{expanded ? 'Exit chart focus' : 'Focus chart'}</Button></div>
    {content}
  </section>;
  return <Drawer open onClose={onClose} destroyOnHidden className="stock-detail-drawer bt-stock-drawer" size={expanded ? '100vw' : 1240}
    title={<div className="stock-drawer-title"><strong>{stock.symbol}</strong><span>Backtest · {run.strategy.name} · Revision {run.strategy.revision}</span></div>}
    extra={<Button type="text" aria-label={expanded ? 'Restore panel width' : 'Expand backtest chart'} icon={expanded ? <CompressOutlined/> : <ExpandOutlined/>} onClick={() => setExpanded(x => !x)}/> }>
{content}</Drawer>;
}
