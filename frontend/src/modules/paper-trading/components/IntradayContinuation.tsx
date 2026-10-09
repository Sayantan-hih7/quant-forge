import { useState } from 'react';
import { App, Button, Drawer, Space, Tag } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import type { PaperData, PaperSession } from '../hooks/useBackendPaper';
import { apiClient } from '../../../services/apiClient';

const phases: Record<string, string> = {
  'unfinished-exits': 'Review unfinished exits', paused: 'Paused until you resume',
  'calendar-unavailable': 'Trading calendar needs updating', 'qualification-required': 'Qualified stocks need updating',
  'daily-loss-limit': 'Daily loss limit reached', monitoring: 'Watching this session',
  'waiting-session': 'Waiting for the next eligible session', stopped: 'Stopped',
};
export function IntradayContinuation({ data, selected, onRefresh, onSettings, unavailable = false }: {
  data?: PaperData; selected?: string; onRefresh: () => Promise<void>; onSettings: (id: string) => void; unavailable?: boolean;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState<string>();
  const { message } = App.useApp();
  const sessions = data?.sessions.filter(s => s.active && !s.strategy.risk.overnight && (!selected || s._id === selected)) ?? [];
  if (!sessions.length) return null;
  const next = sessions[0].intraday?.nextOpenAt;
  const nextLabel = next ? new Date(next).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' IST' : 'Calendar confirmation needed';
  async function pause(session: PaperSession) {
    setBusy(session._id);
    try {
      await apiClient.patch(`/paper/sessions/${session._id}`, { entriesPaused: !session.entriesPaused });
      await onRefresh();
      message.success(session.entriesPaused ? 'Automatic entry checks enabled. Market, data and safety checks still apply.' : 'Automatic entries paused until you resume. Existing exits stay monitored.');
    } catch (error) { message.error((error as Error).message); }
    finally { setBusy(undefined); }
  }
  return <>
    <div className="execution-status"><CalendarOutlined /><strong>Intraday daily plan</strong>
      <span className="muted">{sessions.every(s => s.entriesPaused) ? 'Paused until you resume' : `Next market open: ${nextLabel}`}</span>
      <Button size="small" type="text" onClick={() => setOpen(true)}>Review daily plan</Button>
    </div>
    <Drawer open={open} onClose={() => setOpen(false)} title="Intraday daily plan" size={640}>
      <p>Your monitoring session stays saved across days. You do not need to create it or repeat the backtest each morning just to continue the same tested setup.</p>
      <p className="muted" style={{ marginTop: 8 }}>Next regular market open: {nextLabel}. New signals require a completed candle, current qualification, sufficient history, a healthy worker and fresh quotes. Holidays are skipped.</p>
      <Space orientation="vertical" size={20} style={{ width: '100%', marginTop: 24 }}>
        {sessions.map(s => <section key={s._id} className="intraday-plan-account">
          <strong>{s.strategy.name}</strong><p className="muted">Saved revision {s.strategy.revision} | {s.intraday?.eligibleStocks ?? s.scope?.eligibleIds.length ?? s.ids?.length ?? 0} currently eligible stocks</p>
          <Tag color={s.entriesPaused || s.intraday?.unfinishedPositions ? 'gold' : 'blue'}>{unavailable ? 'Status may be outdated' : phases[s.intraday?.phase ?? ''] ?? 'Checking session status'}</Tag>
          <p>{s.entriesPaused ? 'Automatic new entries stay paused tomorrow and after restarts until you resume them.' : 'Entry checks continue automatically on eligible trading days, using this saved session.'} {s.mode === 'confirmation' ? 'Each paper entry still needs your confirmation.' : s.mode === 'signals' ? 'This session only shows signals; it does not place paper orders.' : 'Matching signals can place paper orders automatically.'}</p>
          {!!s.intraday?.unfinishedPositions && <p className="negative">{s.intraday.unfinishedPositions} intraday position(s) still need an exit. New buys are blocked while positions from an earlier day remain. Exits require eligible fresh prices.</p>}
          {s.intraday?.eligibleStocks === 0 && <p>Review qualification and the stock selection before expecting new entries. A new month needs its published qualified list.</p>}
          <Space wrap style={{ marginTop: 12 }}>
            <Button loading={busy === s._id} disabled={!!busy || unavailable} onClick={() => void pause(s)}>{s.entriesPaused ? 'Resume automatic entries' : 'Pause entries until I resume'}</Button>
            <Button onClick={() => { setOpen(false); onSettings(s._id); }}>Review stocks & settings</Button>
          </Space>
        </section>)}
      </Space>
      <div className="muted" style={{ marginTop: 24 }}>
        <p>Cash and P&amp;L carry forward; they do not reset to starting capital every morning. Daily loss limits use a new daily baseline, but a manual pause or emergency halt is not automatically cleared.</p>
        <p style={{ marginTop: 12 }}>Square-off closes intraday positions; it does not stop the monitoring session. Keep services running for exits and the next session. If the app was offline, missed trades are not replayed.</p>
        <p style={{ marginTop: 12 }}>Editing a strategy does not replace this session's saved revision. Test changed rules, then close positions and stop the old session before starting the new revision.</p>
      </div>
    </Drawer>
  </>;
}
