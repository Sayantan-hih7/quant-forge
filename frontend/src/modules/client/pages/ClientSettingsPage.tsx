import { Alert, App, Button, Descriptions } from 'antd';
import { DisconnectOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { brokerById } from '../../../config/brokers';
import { Panel } from '../../../components/ui/Panel';
import { ThemeSwitcher } from '../../../components/layout/ThemeSwitcher';
import { BrokerSessionBanner } from '../components/BrokerSessionBanner';
import { formatMoney } from '../../../utils/format';
export default function ClientSettingsPage() {
  const { session, connections, signOut, disconnectBroker } = useAuthStore();
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const connection = session && connections[session.email];
  const disconnect = () => modal.confirm({
    title: 'Disconnect your broker?',
    content: 'This removes the saved demo connection and stops access to the client dashboard until you reconnect. No real broker authorization is revoked in this preview.',
    okText: 'Disconnect broker', okButtonProps: { danger: true },
    onOk: () => { disconnectBroker(); navigate('/onboarding/broker', { replace: true }); },
  });
  return <div className="page-enter"><div className="page-heading"><div><h1>Account settings</h1><p>Manage your profile, broker access, and appearance.</p></div><Button icon={<LogoutOutlined />} onClick={() => { signOut(); navigate('/login', { replace: true }); }}>Sign out</Button></div>
    <BrokerSessionBanner />
    <div className="client-settings-grid"><Panel title="Personal account"><div className="settings-panel-body"><Descriptions column={1} items={[{ key: 'name', label: 'Name', children: session?.name }, { key: 'email', label: 'Email', children: session?.email }, { key: 'role', label: 'Account type', children: 'Retail client · Demo' }]} /><div className="appearance-row"><span>Appearance</span><ThemeSwitcher /></div></div></Panel>
    <Panel title="Broker connection"><div className="settings-panel-body">{connection ? <><Descriptions column={1} items={[{ key: 'broker', label: 'Broker', children: brokerById(connection.brokerId)?.name }, { key: 'client', label: 'Client ID', children: connection.clientId }, { key: 'method', label: 'Authorization', children: connection.method === 'oauth' ? 'Simulated OAuth' : 'Sample API credentials' }, { key: 'capital', label: 'Allocated capital', children: formatMoney(connection.capital) }, { key: 'loss', label: 'Daily stop loss', children: formatMoney(connection.dailyLoss) }]} /><Alert type="info" title="Secrets are not stored in this preview" description="Only non-secret account metadata and risk preferences are saved on this device." /><Button className="mt-5" danger icon={<DisconnectOutlined />} onClick={disconnect}>Disconnect broker</Button></> : <Button type="primary" onClick={() => navigate('/onboarding/broker')}>Connect a broker</Button>}</div></Panel></div>
  </div>;
}
