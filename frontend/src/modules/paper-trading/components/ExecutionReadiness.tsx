import { Alert, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { PaperData } from '../hooks/useBackendPaper';

/** Quote coverage is for this selection, not merely a globally connected feed. */
export function ExecutionReadiness({ data, ids, error, monitoring = false }: { data?: PaperData; ids: string[]; error?: string; monitoring?: boolean }) {
  const navigate = useNavigate();
  const selection = [...new Set(ids)];
  const feed = data?.feed;
  const fresh = selection.filter(id => feed?.freshIds?.includes(id)).length;
  let title = 'Checking paper execution readiness', description = 'Waiting for the current worker and feed status.';
  let type: 'info' | 'warning' | 'success' = 'info', needsConnectionHelp = false;
  if (error) {
    type = 'warning'; title = 'Execution status could not be refreshed'; description = 'The last status may be outdated. Wait for a successful refresh before relying on paper execution.';
  } else if (data && (!data.workerRunning || feed?.workerRunning === false)) {
    type = 'warning'; title = 'A background worker is offline'; description = 'Keep the app services running for candle monitoring, live data and paper exits. They restore saved sessions when the app starts again.';
  } else if (feed?.automation?.state === 'blocked' || ['error', 'otp-required'].includes(feed?.state ?? '')) {
    type = 'warning'; needsConnectionHelp = true; title = 'Live data needs attention'; description = `${feed?.automation?.state === 'blocked' ? feed.automation.message : feed?.message} Paper fills wait for fresh quotes; saved sessions are retained.`;
  } else if (feed?.automation?.state === 'paused') {
    type = 'warning'; title = 'Execution feed paused'; description = 'The feed was paused in connection settings. Starting a new session or resuming automatic entries enables it again.'; needsConnectionHelp = true;
  } else if (!monitoring && (!feed?.enabled || fresh < selection.length)) {
    title = 'Live data connects automatically'; description = `Starting paper monitoring subscribes to your selected qualified stocks and restores the connection after app restarts.${selection.length ? ` ${fresh} of ${selection.length} selected stocks currently have fresh quotes.` : ''}`;
  } else if (data?.marketOpen === false) {
    title = 'Market closed - paper fills waiting'; description = 'Your subscriptions are saved. Live data reconnects before the next market session while the app services are running. Fills require market hours and fresh quotes.';
  } else if (data && (!feed?.enabled || feed.state !== 'live' || fresh < selection.length)) {
    title = 'Waiting for automatic live data'; description = `${fresh} of ${selection.length} monitored stocks have fresh quotes. Subscriptions and reconnection are automatic. Paper buys, sells and protective exits wait for a fresh quote for their stock.`;
  } else if (feed?.state === 'live') {
    type = 'success'; title = selection.length ? 'Execution quotes ready for this selection' : 'Execution feed connected';
    description = selection.length ? `${fresh} of ${selection.length} selected stocks have fresh quotes. Paper fills still follow your rules, risk limits and confirmation mode.` : 'Choose stocks to check their individual quote coverage.';
  }
  return <Alert showIcon type={type} title={title} description={description} action={needsConnectionHelp ? <Button onClick={() => navigate('/data-sources')}>Connection settings</Button> : undefined} />;
}
