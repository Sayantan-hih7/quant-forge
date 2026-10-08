import { useState } from 'react';
import { Alert, Button, Collapse, Descriptions, Table, Tag } from 'antd';
import { StockDetailDrawer } from '../../stock-details/components/StockDetailDrawer';
import { useStockResource } from '../../stock-details/hooks/useStockResource';
import type { ChartEvent, ChartLevel } from '../../stock-details/types';
import { stockMoney, stockTime } from '../../stock-details/utils/format';
import { fieldLabel } from '../../qualification/config/ruleFields';
import type { PaperData, PaperOrder, PaperPosition, PaperSession, PaperSignal } from '../hooks/useBackendPaper';

export interface PaperChartSelection { sessionId: string; instrumentId: string; symbol?: string; eventId?: string }
interface PaperChartData { session: PaperSession; position: (PaperPosition & { openedAt: string; costPaise: number }) | null; fills: PaperOrder[]; signals: PaperSignal[]; truncated: boolean }
const money = (paise?: number) => stockMoney(paise === undefined ? undefined : paise / 100);
export function PaperStockChart({ selection, data, onClose, onChange }: {
  selection: PaperChartSelection; data: PaperData; onClose: () => void; onChange: (selection: PaperChartSelection) => void;
}) {
  const { sessionId, instrumentId } = selection;
  const resource = useStockResource<PaperChartData>(`/paper/sessions/${sessionId}/stocks/${encodeURIComponent(instrumentId)}/chart`, 2500);
  const session = resource.data?.session ?? data.sessions.find(s => s._id === sessionId), position = resource.data?.position;
  const current = data.positions.find(p => p.sessionId === sessionId && p.instrumentId === instrumentId);
  const [selectedEvent, setSelectedEvent] = useState(selection.eventId);
  const fills = resource.data?.fills ?? [], signals = resource.data?.signals ?? [];
  const events: ChartEvent[] = [
    ...fills.filter(o => o.status === 'filled' && o.filledAt && o.fillPaise !== undefined).map(o => ({ id: `fill:${o._id}`, kind: 'fill' as const, side: o.side, at: o.filledAt!, price: o.fillPaise! / 100, quantity: o.quantity, label: o.reason })),
    ...signals.map(s => ({ id: `signal:${s._id}`, kind: 'signal' as const, side: s.side, at: s.barEnd, price: s.referencePrice, label: s.message ?? 'Rules matched on a completed candle.' })),
  ].sort((a,b) => b.at.localeCompare(a.at));
  const levels: ChartLevel[] = [];
  if (position) {
    levels.push({ id: 'entry', label: `Entry · ${position.quantity} shares remaining`, price: position.entryPaise / 100, kind: 'entry' }, { id: 'stop', label: 'Current stop', price: position.stopPaise / 100, kind: 'stop' });
    if (position.initialRiskPaise && position.entryPaise - position.initialRiskPaise !== position.stopPaise) levels.push({ id: 'initial-stop', label: 'Initial stop', price: (position.entryPaise - position.initialRiskPaise) / 100, kind: 'initial-stop' });
    if (position.targets?.length) {
      let remaining = position.quantity;
      position.targets.forEach((t,i,targets) => {
        const shares = t.completed ? 0 : i === targets.length - 1 ? remaining : Math.min(remaining, t.quantity);
        remaining -= shares;
        if (shares > 0) levels.push({ id: `target-${i}`, label: `T${i+1} · ${shares} shares`, price: t.pricePaise / 100, kind: 'target' });
      });
    }
    else if (position.targetPaise > 0) levels.push({ id: 'target', label: 'Target · remaining shares', price: position.targetPaise / 100, kind: 'target' });
  }
  const booked = !resource.data || resource.data.truncated ? undefined : fills.reduce((sum,o) => sum + (o.side === 'SELL' ? 1 : -1) * o.quantity * (o.fillPaise ?? 0) - (o.feePaise ?? 0), position?.costPaise ?? 0);
  const chosen = events.find(e => e.id === selectedEvent), chosenSignal = signals.find(s => `signal:${s._id}` === selectedEvent), chosenFill = fills.find(o => `fill:${o._id}` === selectedEvent);
  const ids = [...new Set([...(session?.scope?.monitoredIds ?? session?.ids ?? []), ...data.positions.filter(p => p.sessionId === sessionId).map(p => p.instrumentId), instrumentId])];
  const index = ids.indexOf(instrumentId);
  const symbol = selection.symbol ?? data.symbols?.[instrumentId] ?? current?.symbol ?? instrumentId;
  const context = <section className="stock-trade-context" aria-label="Strategy and paper trades">
    <div className="stock-section-heading"><div><h3>{session?.strategy.name ?? 'Strategy activity'}</h3><p className="muted">{session ? `Revision ${session.strategy.revision} · ${session.active ? 'Monitoring' : 'Previous session'}` : 'Loading strategy…'} · Paper money</p></div><Tag color="blue">{session?.mode === 'signals' ? 'Signals only' : session?.mode === 'automatic' ? 'Automatic paper' : 'Confirm paper trades'}</Tag></div>
    {resource.error && <Alert showIcon type="warning" title="Trade details could not refresh" description={resource.error} action={<Button size="small" onClick={resource.retry}>Retry</Button>}/>}
    <div className="stock-trade-metrics">
      <div><span>Shares remaining</span><strong>{position ? `${position.quantity} / ${position.initialQuantity ?? position.quantity}` : resource.loading ? 'Loading…' : 'No open position'}</strong></div>
      <div><span>Entry price</span><strong>{money(position?.entryPaise)}</strong></div>
      <div><span>Open P&L · latest mark</span><strong className={(current?.mark?.unrealizedPaise ?? 0) < 0 ? 'negative' : 'positive'}>{money(current?.mark?.unrealizedPaise)}</strong></div>
      <div><span>Realized P&L · this stock / session</span><strong className={(booked ?? 0) < 0 ? 'negative' : 'positive'}>{money(booked)}</strong></div>
    </div>
    {current?.mark && <p className="stock-chart-note">P&L marked at {stockTime(current.mark.at)} · {current.mark.fresh ? 'Fresh execution quote' : 'Last received execution quote'}. Includes entry fees; open P&L excludes future exit fees.</p>}
    {!!levels.length && <div className="stock-trade-levels">{levels.map(l => <Tag key={l.id} color={l.kind === 'stop' ? 'red' : l.kind === 'target' ? 'green' : 'blue'}>{l.label} {stockMoney(l.price)}</Tag>)}</div>}
    {position && <p className="stock-chart-note">{position.breakevenActivated && !position.exitControl?.stopOverridden ? 'Stop moved to entry or higher. ' : ''}{position.trailingActivated && !position.exitControl?.stopOverridden ? 'Trailing stop is active. ' : ''}{position.exitControl?.stopOverridden ? 'Manual stop override is active. ' : ''}Levels show the current open position. Previous stop movements are not reconstructed.</p>}
    {chosen && <Alert className="stock-event-detail" showIcon type="info" title={`${chosen.side} ${chosen.kind === 'signal' ? 'signal · not a fill' : `paper fill · ${chosen.quantity} shares at ${stockMoney(chosen.price)}`}`} description={<>
      <p>{stockTime(chosen.at)} · {chosen.label}</p>
      {chosenFill && <p>Fees {money(chosenFill.feePaise)} · {chosenFill.source === 'protection' ? 'Automatic protective exit' : chosenFill.source === 'manual' ? 'Manual paper order' : 'Strategy order'}</p>}
      {chosenSignal?.checks?.map((c,i) => <div key={i}><Tag color={c.matched === true ? 'green' : c.matched === null ? 'gold' : 'default'}>{c.matched === true ? 'Met' : c.matched === null ? 'Missing data' : 'Not met'}</Tag>{fieldLabel(c.missingField ?? c.field)}{c.left != null ? `: ${c.left.toFixed(2)}` : ''}{c.right != null ? ` / ${c.right.toFixed(2)}` : ''} {c.reason}</div>)}
    </>}/>}
    <Collapse defaultActiveKey={['activity']} items={[{ key: 'activity', label: `Signals & actual fills (${events.length})`, children: <>
      <p className="muted">Select an event to locate its candle and inspect the recorded result. Blue signals are separate from filled orders.</p>
      <Table<ChartEvent> rowKey="id" size="small" dataSource={events} pagination={{ pageSize: 8, size: 'small' }} scroll={{ x: 600 }} locale={{ emptyText: resource.loading ? 'Loading recorded activity…' : 'No signal or fill recorded for this stock in this strategy yet.' }} columns={[
        { title: 'Event', render: (_,e) => <Button type="link" size="small" onClick={() => setSelectedEvent(e.id)}>{e.side} {e.kind === 'fill' ? 'paper fill' : 'signal'}</Button> },
        { title: 'Time · IST', render: (_,e) => stockTime(e.at) }, { title: 'Price', render: (_,e) => stockMoney(e.price) },
        { title: 'Shares', render: (_,e) => e.kind === 'fill' ? e.quantity : '—' }, { title: 'Reason', dataIndex: 'label' },
      ]}/>
      {resource.data?.truncated && <p className="stock-chart-note">Showing the latest 200 fills and 100 signals. Realized P&L is unavailable because earlier fills are outside this chart’s activity window.</p>}
    </> }]}/>
    <Descriptions className="mt-4" size="small" column={1} items={[{ key: 'timing', label: 'Decision timing', children: session?.strategy.entry.cadence === 'daily' ? 'After a completed daily candle' : `${session?.strategy.entry.cadence ?? '—'} completed candles` }]}/>
  </section>;
  return <StockDetailDrawer stock={{ instrumentId, instrument: { symbol, exchange: instrumentId.split(':')[0] } }} onClose={onClose}
    onPrevious={index > 0 ? () => onChange({ sessionId, instrumentId: ids[index-1] }) : undefined}
    onNext={index < ids.length - 1 ? () => onChange({ sessionId, instrumentId: ids[index+1] }) : undefined}
    strategy={session?.strategy} events={events} levels={levels} focusEventId={selectedEvent} onSelectEvent={setSelectedEvent} tradeContent={context}/>;
}
