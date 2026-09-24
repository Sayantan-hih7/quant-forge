import { Button, Empty, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../../../components/ui/Panel';
import { useAuthStore } from '../../../store/authStore';
import { useSignalMonitorStore } from '../store/signalMonitorStore';
import { clockLabel } from '../utils/monitoring';
export function SignalBroadcast() {
  const owner = useAuthStore(state => state.session?.email ?? 'demo');
  const workspace = useSignalMonitorStore(state => state.workspaces[owner]);
  const navigate = useNavigate();
  const latest = workspace?.signals[0];
  return <Panel title="Latest strategy alert" extra={<Tag color="purple">Alerts only</Tag>}><div className="signal-body">{latest ? <><div className="flex items-center justify-between"><span className="tiny-label">{clockLabel(latest.time)} IST</span><Tag color={latest.side === 'BUY' ? 'green' : 'red'}>{latest.side}</Tag></div><h3>{latest.symbol}</h3><div className="data-row"><span>Strategy</span><strong>{latest.strategy}</strong></div><div className="data-row"><span>Status</span><strong>{latest.disposition}</strong></div><p className="muted">{latest.explanation}</p></> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Start monitoring a strategy to see its alerts here." />}</div><div className="panel-bottom"><Button block type="text" onClick={() => navigate('/signal-runner')}>Open signal activity</Button></div></Panel>;
}