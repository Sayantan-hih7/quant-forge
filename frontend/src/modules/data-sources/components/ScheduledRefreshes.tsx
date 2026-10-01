import { Alert, Card, Table, Tag, Tooltip } from 'antd';
import type { DataStatus, MaintenanceTask } from '../types';

const labels: Record<string, string> = {
  'daily-closes': 'Daily closing prices (NSE + BSE)', memberships: 'Index membership', fundamentals: 'Company metrics (Dhan, ROE fallback)',
  news: 'News, filings & sentiment', pledge: 'Promoter pledge', 'delivery-nse': 'NSE monthly delivery & turnover', 'delivery-bse': 'BSE monthly delivery & turnover',
};
const when = (value: string | null) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function ScheduledRefreshes({ tasks, closes, workerOnline }: { tasks: MaintenanceTask[]; closes: DataStatus['dailyCloses']; workerOnline: boolean | undefined }) {
  const missing = tasks.filter(task => !task.nextRunAt);
  return <Card title="Scheduled refreshes" extra={closes ? <Tooltip title="Unadjusted exchange closes, used for research such as related-stock co-movement. Never used as backtest candles."><Tag>Closes {closes.from} → {closes.to} · {closes.sessions} sessions · {closes.companiesOnLatest.toLocaleString('en-IN')} companies</Tag></Tooltip> : null}>
    {workerOnline === false && <Alert className="mb-4" type="warning" showIcon title="Data worker offline" description="Scheduled refreshes run in the data worker. Start the app with npm run dev; missed refreshes catch up automatically when it starts." />}
    {workerOnline !== false && missing.length > 0 && <Alert className="mb-4" type="info" showIcon title="Restart the data worker to activate new schedules" description={`Not yet scheduled: ${missing.map(task => labels[task.task] ?? task.task).join(', ')}.`} />}
    <Table<MaintenanceTask> size="small" rowKey="task" dataSource={tasks} pagination={false} scroll={{ x: 640 }} columns={[
      { title: 'Dataset', dataIndex: 'task', render: (task: string) => labels[task] ?? task },
      { title: 'Schedule', dataIndex: 'schedule' },
      { title: 'Next run', dataIndex: 'nextRunAt', render: when },
      { title: 'Last run', render: (_, row) => !row.lastStatus ? <Tag>Never</Tag> : <Tooltip title={row.lastError ?? undefined}>
        <Tag color={row.lastStatus === 'completed' ? 'green' : row.lastStatus === 'failed' ? 'red' : row.lastStatus === 'partial' ? 'orange' : 'blue'}>{row.lastStatus}</Tag>{when(row.lastFinishedAt ?? row.lastStartedAt)}</Tooltip> },
    ]} />
    <p className="muted mt-3">Each refresh is safe to repeat and only fetches what is missing or expired. If the worker was offline, missed refreshes run when it starts. A failed refresh retries three times, then again at its next scheduled time.</p>
  </Card>;
}
