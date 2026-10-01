import '../../../styles/manual-trading.css';
import { useState } from 'react';
import { Alert, App, Button, Empty, InputNumber, Popconfirm, Space, Table, Tag, Tooltip } from 'antd';
import { apiClient } from '../../../services/apiClient';
import { PaperPositionTargets } from '../../paper-trading/components/PaperPositionTargets';
import type { StockQuote } from '../../stock-details/types';
import type { ManualOverview, ManualTrigger } from '../types';
import { inr, paise } from '../format';

const statusColor: Record<string, string> = { pending: 'blue', confirmation: 'blue', filled: 'green', cancelled: 'default', rejected: 'red', expired: 'default',
  active: 'blue', triggered: 'green', failed: 'red' };
function describeRule(trigger: ManualTrigger) {
  const parts = trigger.rule.groups.map(group => group.conditions.map(c => `${String(c.left)} ${String(c.operator)} ${c.rightType === 'indicator' ? String(c.right) : String(c.value)}`).join(` ${group.logic} `));
  return parts.join(` ${trigger.rule.logic} `);
}

/** Opens the manual paper account the first time. */
export function OpenManualAccount({ onOpened }: { onOpened: () => void }) {
  const { message } = App.useApp();
  const [capital, setCapital] = useState<number | null>(100000), [busy, setBusy] = useState(false);
  return <div className="mt-open-account">
    <div><strong>Start manual paper trading</strong><p className="muted">Practice buying and selling any stock with simulated money. Separate from your strategies; nothing is sent to a broker.</p></div>
    <Space.Compact><InputNumber min={10000} max={100000000} step={10000} value={capital} onChange={setCapital} prefix="₹" style={{ width: 170 }} aria-label="Starting paper money" />
      <Button type="primary" loading={busy} disabled={!capital} onClick={async () => {
        setBusy(true);
        try { await apiClient.post('/paper/manual/account', { capital: Math.round(capital!) }); message.success('Manual paper account opened'); onOpened(); }
        catch (e) { message.error((e as Error).message); } finally { setBusy(false); }
      }}>Open account</Button></Space.Compact>
  </div>;
}

/** This stock's manual paper position, open orders and conditions, inside the stock screen. */
export function StockTradePanel({ data, quote, onChanged, onSell }: { data: ManualOverview; quote?: StockQuote; onChanged: () => void; onSell: () => void }) {
  const { message } = App.useApp();
  const position = data.positions?.[0];
  const openOrders = (data.orders ?? []).filter(o => ['pending', 'confirmation'].includes(o.status));
  const history = (data.orders ?? []).filter(o => !['pending', 'confirmation'].includes(o.status)).slice(0, 8);
  const activeTriggers = (data.triggers ?? []).filter(t => t.status === 'active');
  const pastTriggers = (data.triggers ?? []).filter(t => t.status !== 'active').slice(0, 5);
  const act = async (path: string, body?: unknown, done?: string) => { try { await apiClient.post(path, body); if (done) message.success(done); onChanged(); } catch (e) { message.error((e as Error).message); } };
  const price = quote?.price ?? paise(position?.mark?.pricePaise);
  const pnl = position && price != null ? price * position.quantity - position.costPaise / 100 : null;
  if (!position && !openOrders.length && !activeTriggers.length && !history.length && !pastTriggers.length) return null;
  return <section className="mt-panel" aria-label="Your paper trades in this stock">
    <div className="stock-section-heading"><h3>Your paper trades</h3><span className="muted">Manual account</span></div>
    {(data.workerRunning === false) && <Alert type="warning" showIcon title="Paper worker offline: orders, stops and targets are not being processed. Start the app with npm run dev." />}
    {position ? <div className="mt-position">
      <div className="mt-position-head">
        <div><span className="muted">Holding</span><strong>{position.quantity}{position.initialQuantity && position.initialQuantity !== position.quantity ? ` / ${position.initialQuantity}` : ''} shares</strong></div>
        <div><span className="muted">Avg buy</span><strong>{inr(paise(position.entryPaise))}</strong></div>
        <div><span className="muted">P&L</span><strong className={(pnl ?? 0) >= 0 ? 'positive' : 'negative'}>{pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}${inr(pnl)}`}</strong></div>
        <div><span className="muted">Stop-loss</span><strong>{inr(paise(position.stopPaise))}</strong>{position.trailingActivated && <Tag color="purple">Trailing</Tag>}{position.breakevenActivated && <Tag color="blue">At cost</Tag>}</div>
        <div><span className="muted">Targets</span><PaperPositionTargets position={position} /></div>
        <div><span className="muted">Type</span><Tag>{position.plan?.overnight === false ? 'Intraday · exits 3:15 PM' : 'Delivery'}</Tag></div>
      </div>
      <Space wrap>
        <Button danger onClick={onSell}>Sell / add sell condition</Button>
        <Popconfirm title={`Sell all ${position.quantity} shares at market?`} onConfirm={() => act(`/paper/positions/${encodeURIComponent(position._id)}/exit`, { id: crypto.randomUUID(), expectedOpenedAt: position.openedAt }, 'Exit order placed')}>
          <Button disabled={!data.marketOpen}>Exit all at market</Button></Popconfirm>
        {!data.marketOpen && <span className="muted">Market closed: stops, targets and exits run in the next session.</span>}
      </Space>
    </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="You don't hold this stock in the manual account." />}

    {openOrders.length > 0 && <><h4>Open orders</h4><Table size="small" rowKey="_id" pagination={false} dataSource={openOrders} columns={[
      { title: 'Side', render: (_, o) => <Tag color={o.side === 'BUY' ? 'green' : 'red'}>{o.side}</Tag> },
      { title: 'Qty', dataIndex: 'quantity', render: (q: number) => q || 'All' },
      { title: 'Type', render: (_, o) => o.orderType === 'limit' ? `Limit ${inr(paise(o.limitPaise))}` : o.orderType === 'stop' ? `Stop ${inr(paise(o.triggerPaise))}` : 'Market' },
      { title: 'Why', render: (_, o) => <span className="muted">{o.reason}</span> },
      { title: '', render: (_, o) => o.source === 'protection' ? <Tag>Automatic exit</Tag> : <Button size="small" onClick={() => act(`/paper/orders/${o._id}/cancel`, undefined, 'Order cancelled')}>Cancel</Button> },
    ]} /></>}

    {activeTriggers.length > 0 && <><h4>Waiting conditions</h4>{activeTriggers.map(t => <div key={t._id} className="mt-trigger">
      <div><Tag color={t.side === 'BUY' ? 'green' : 'red'}>{t.side} {t.quantity}</Tag><code>{describeRule(t)}</code><span className="muted"> · {t.cadence} candles · until {new Date(t.validUntil).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        {t.message && <div className="muted">{t.message}</div>}</div>
      <Button size="small" onClick={() => act(`/paper/manual/triggers/${t._id}/cancel`, undefined, 'Condition cancelled')}>Cancel</Button>
    </div>)}</>}

    {(history.length > 0 || pastTriggers.length > 0) && <><h4>Recent activity</h4><ul className="mt-history">
      {history.map(o => <li key={o._id}><Tag color={statusColor[o.status]}>{o.status}</Tag><strong>{o.side}</strong> {o.quantity || ''} {o.fillPaise ? `@ ${inr(paise(o.fillPaise))}` : ''}
        <span className="muted"> · {o.reason}{o.message ? ` · ${o.message}` : ''} · {new Date(o.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        {o.realizedPnlPaise != null && <Tooltip title="Realised P&L after fees"><span className={o.realizedPnlPaise >= 0 ? 'positive' : 'negative'}> {o.realizedPnlPaise >= 0 ? '+' : ''}{inr(paise(o.realizedPnlPaise))}</span></Tooltip>}</li>)}
      {pastTriggers.map(t => <li key={t._id}><Tag color={statusColor[t.status]}>condition {t.status}</Tag><code>{describeRule(t)}</code><span className="muted"> · {t.message}</span></li>)}
    </ul></>}
  </section>;
}
