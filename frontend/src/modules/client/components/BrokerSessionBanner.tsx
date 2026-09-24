import { Alert, App, Button } from 'antd';
import { useAuthStore } from '../../../store/authStore';
import { brokerById } from '../../../config/brokers';
import { useNow } from '../../../hooks/useNow';

export function BrokerSessionBanner() {
  const { session, connections, renewBroker } = useAuthStore();
  const now = useNow();
  const { modal } = App.useApp();
  const connection = session && connections[session.email];
  if (!connection) return null;
  const remaining = Math.max(0, Math.ceil((connection.expiresAt - now) / 60_000));
  const expired = remaining === 0;
  const warning = remaining <= 60;
  const renew = () => modal.confirm({
    title: 'Renew your demo broker session',
    content: 'Approve a simulated reauthorization. No broker login or real token refresh is performed.',
    okText: 'Approve demo renewal',
    onOk: renewBroker,
  });
  return <Alert className="broker-session-banner" type={expired ? 'error' : warning ? 'warning' : 'success'} showIcon
    title={expired ? 'Broker session expired · new trades paused' : `${brokerById(connection.brokerId)?.name} session ${warning ? 'expiring soon' : 'connected'}`}
    description={expired ? 'Reconnect to resume your simulated trading workspace.' : `Demo session expires in ${Math.floor(remaining / 60)}h ${remaining % 60}m. Your risk limits remain active.`}
    action={<Button size="small" onClick={renew}>{expired ? 'Reconnect' : 'Renew session'}</Button>} />;
}
