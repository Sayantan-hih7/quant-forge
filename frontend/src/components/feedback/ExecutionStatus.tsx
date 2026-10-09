import { Button, Popover } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { PaperData } from '../../modules/paper-trading/hooks/useBackendPaper';

/** A reserved status row keeps execution blockers visible without a stack of banners. */
export function ExecutionStatus({ data, error, onRetry }: { data?: PaperData; error?: string; onRetry: () => void }) {
  const navigate = useNavigate();
  const warnings = [...new Set(data?.safety?.warnings ?? [])];
  const stranded = data?.marketOpen === false && data.positions.some(p => data.sessions.some(s => s._id === p.sessionId && !s.strategy.risk.overnight));
  const offline = data && (!data.workerRunning || data.feed?.workerRunning === false);
  const active = data?.sessions.some(s => s.active);
  const ids = [...new Set(data?.sessions.filter(s => s.active).flatMap(s => s.scope?.monitoredIds ?? s.ids ?? []) ?? [])];
  const fresh = ids.filter(id => data?.feed?.freshIds.includes(id)).length;
  const feedWaiting = active && data?.marketOpen !== false && (data?.feed?.state !== 'live' || fresh < ids.length);
  const title = error ? 'Execution status unavailable' : !data ? 'Checking execution status'
    : stranded ? 'Intraday positions still open after close' : data.safety?.halted ? 'New buys halted'
    : warnings.length ? `Execution safety: ${warnings.length} ${warnings.length === 1 ? 'issue' : 'issues'}`
    : offline ? 'Background worker offline' : data.marketOpen === false ? 'Market closed'
    : feedWaiting ? 'Waiting for live quotes' : active ? 'Monitoring active' : 'No active monitoring';
  const attention = !!error || !!stranded || !!data?.safety?.halted || warnings.length > 0 || !!offline || !!feedWaiting;
  const details = <div className="execution-status-details">
    {error && <p>Current execution status could not be verified. Displayed records may be outdated. {error}</p>}
    {stranded && <p>Intraday positions did not finish exiting. Review orders before the next session. Stale closing quotes cannot fill orders.</p>}
    {data?.safety?.halted && <p>New buys are halted. Review safety settings before resuming.</p>}
    {warnings.map(w => <p key={w}>{w}</p>)}
    {offline && <p>A background worker is offline. Monitoring and protective exits need the app services running.</p>}
    {data?.marketOpen === false && <p>Paper fills wait for the next eligible market session and fresh quotes. Displayed prices retain their timestamps.</p>}
    {feedWaiting && <p>{data?.feed?.message || 'Waiting for fresh quotes for monitored stocks.'}</p>}
    {!!ids.length && <p>{fresh} of {ids.length} monitored stocks currently have fresh quotes.</p>}
    <p>Paper execution only. A connected feed does not guarantee fresh quotes for every stock.</p>
    {data?.safety?.notices?.map(note => <p key={note}>{note}</p>)}
    <div className="feedback-actions"><Button size="small" onClick={onRetry}>Refresh status</Button><Button size="small" onClick={() => navigate('/data-sources')}>Connections & Data</Button></div>
  </div>;
  return <div className={`execution-status ${attention ? 'needs-attention' : ''}`} role="status">
    {attention ? <ExclamationCircleOutlined /> : data?.marketOpen === false || !active ? <InfoCircleOutlined /> : <CheckCircleOutlined />}
    <strong>{title}</strong>
    {error && <span className="muted">Last records may be outdated</span>}
    <Popover trigger="click" placement="bottomRight" title="Paper execution status" content={details}>
      <Button size="small" type="text" aria-label="View execution status details">Details</Button>
    </Popover>
  </div>;
}
