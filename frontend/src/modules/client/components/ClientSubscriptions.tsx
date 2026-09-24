import { Progress, Tag } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';
import { Panel } from '../../../components/ui/Panel';
import { formatMoney } from '../../../utils/format';
export function ClientSubscriptions({ capital }: { capital: number }) {
  const items = [
    { name: 'Intraday Momentum', description: 'NSE Equity · Buy + Sell · 5-minute candles', share: 60, pnl: capital * 0.012, color: 'var(--primary)' },
    { name: 'Swing Breakouts', description: 'NSE Equity · Buy + Sell · Daily candles', share: 40, pnl: capital * 0.006, color: 'var(--purple)' },
  ];
  return <Panel title="Active strategy subscriptions" extra={<span className="tiny-label">2 DEMO STRATEGIES</span>}>
    <div className="client-subscriptions">{items.map((item) => <article className="subscription-card" key={item.name}><div className="subscription-title"><span className="subscription-icon"><ApartmentOutlined /></span><div><h3>{item.name}</h3><p>{item.description}</p></div><Tag color="blue">DEMO</Tag></div>
      <div className="subscription-values"><div><small>Allocated capital</small><strong>{formatMoney(capital * item.share / 100)}</strong></div><div><small>Today’s P&amp;L</small><strong className="positive">+{formatMoney(item.pnl)}</strong></div></div>
      <Progress percent={item.share} strokeColor={item.color} showInfo={false} size="small" /><small className="muted">{item.share}% of your allocation</small>
    </article>)}</div>
  </Panel>;
}
