import { Button, Progress, Table } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { formatMoney } from '../../../utils/format';
import { Panel } from '../../../components/ui/Panel';
import { BrokerSessionBanner } from '../components/BrokerSessionBanner';
import { ClientSubscriptions } from '../components/ClientSubscriptions';

export default function ClientDashboardPage({ subscriptions = false }: { subscriptions?: boolean }) {
  const { session, connections } = useAuthStore();
  const navigate = useNavigate();
  const connection = session && connections[session.email];
  if (!connection) return null;
  const usedLoss = Math.round(connection.dailyLoss * 0.28);
  return <div className="page-enter">
    <div className="page-heading"><div><h1>{subscriptions ? 'My strategy subscriptions' : `Welcome, ${session.name.split(' ')[0]}`}</h1><p>Your portfolio, strategies, and risk limits at a glance. All values are simulated.</p></div><Button icon={<SettingOutlined />} onClick={() => navigate('/client/settings')}>Manage account</Button></div>
    <BrokerSessionBanner />
    {!subscriptions && <div className="client-metrics">{[
      ['Allocated capital', formatMoney(connection.capital), 'Reserved for demo strategies'],
      ['Today’s P&L', '+' + formatMoney(connection.capital * 0.018), '+1.80% · Demo snapshot'],
      ['Active subscriptions', '2', 'Intraday and swing · Sample subscriptions'],
      ['Risk multiplier', `${connection.multiplier.toFixed(1)}×`, 'Your configured position sizing'],
    ].map(([label, value, detail]) => <section className="metric-card" key={label}><div className="metric-top">{label}</div><div className={`metric-value ${label === 'Today’s P&L' ? 'positive' : ''}`}>{value}</div><small className="muted">{detail}</small></section>)}</div>}
    <ClientSubscriptions capital={connection.capital} />
    {!subscriptions && <div className="client-bottom"><Panel title="Daily stop-loss tracker"><div className="loss-tracker"><div className="flex justify-between"><span className="muted">Demo loss budget used</span><strong>{formatMoney(usedLoss)} / {formatMoney(connection.dailyLoss)}</strong></div><Progress percent={28} strokeColor="var(--warning)" /><p>{formatMoney(connection.dailyLoss - usedLoss)} remaining before simulated auto-halt.</p><div className="risk-rule"><span className="status-dot" /> Daily loss protection enabled</div></div></Panel>
    <Panel title="Sample account activity"><Table size="small" pagination={false} rowKey="id" scroll={{ x: 350 }} dataSource={[{ id: 1, instrument: 'RELIANCE', side: 'BUY', quantity: 5, status: 'Filled' }, { id: 2, instrument: 'TCS', side: 'SELL', quantity: 1, status: 'Filled' }]} columns={[{ title: 'Instrument', dataIndex: 'instrument' }, { title: 'Side', dataIndex: 'side' }, { title: 'Qty', dataIndex: 'quantity' }, { title: 'Status', dataIndex: 'status', render: (value: string) => <span className="positive">{value}</span> }]} /></Panel></div>}
  </div>;
}
