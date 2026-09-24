import { ApartmentOutlined, FileTextOutlined, RadarChartOutlined, RiseOutlined, SafetyCertificateOutlined, StockOutlined } from '@ant-design/icons';
import { useQualification } from '../../qualification/hooks/useQualification';
import { useSignalMonitorStore } from '../../signals/store/signalMonitorStore';
import { usePaperTradingStore } from '../../paper-trading/store/paperTradingStore';
import { monitorDefinitions } from '../../signals/utils/monitoring';
import { money } from '../../backtesting/config/backtestDefaults';
export function MetricCards() {
  const { owner, workspace, cache } = useQualification();
  const monitor = useSignalMonitorStore(state => state.workspaces[owner]);
  const sessions = usePaperTradingStore(state => state.sessions[owner]);
  const ready = monitor?.signals.filter(event => event.disposition === 'ready' && event.expiresAt >= monitor.clock && monitor.feed === 'healthy') ?? [];
  const metrics = [
    { title: 'Qualified stocks', value: cache?.candidates.length ?? 0, detail: 'Current monthly list', icon: <SafetyCertificateOutlined />, tone: 'blue' },
    { title: 'Saved strategies', value: monitorDefinitions(workspace).length, detail: 'Buy + sell + risk', icon: <ApartmentOutlined />, tone: 'purple' },
    { title: 'Active monitors', value: Object.values(monitor?.monitors ?? {}).filter(item => item.state !== 'stopped').length, detail: !monitor || monitor.feed === 'healthy' ? 'Simulated monitoring' : 'Feed needs attention', icon: <RadarChartOutlined />, tone: 'blue' },
    { title: 'Ready alerts', value: ready.length, detail: `${ready.filter(event => event.side === 'BUY').length} buy / ${ready.filter(event => event.side === 'SELL').length} sell`, icon: <FileTextOutlined />, tone: 'green' },
    { title: 'Paper positions', value: (sessions ?? []).reduce((sum, session) => sum + session.positions.length, 0), detail: 'Held across paper sessions', icon: <StockOutlined />, tone: 'blue' },
    { title: 'Paper realized P&L', value: money((sessions ?? []).reduce((sum, session) => sum + session.realized, 0)), detail: 'Confirmed simulated fills', icon: <RiseOutlined />, tone: 'green' },
  ];
  return <div className="metrics-grid">{metrics.map(metric => <section className={`metric-card ${metric.tone}`} key={metric.title}><div className="metric-top"><span>{metric.title}</span>{metric.icon}</div><div className="metric-value">{metric.value}</div><div className="metric-bottom"><span>{metric.detail}</span><small>Demo</small></div></section>)}</div>;
}