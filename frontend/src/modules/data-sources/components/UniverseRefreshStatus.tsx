import { Alert, Card, Space, Tag } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import type { UniverseRefresh } from '../types';

const dateLabel = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST';
export function UniverseRefreshStatus({ status }: { status: UniverseRefresh }) {
  return <Card size="small" title={<Space><CalendarOutlined /> Automatic stock-universe update</Space>} extra={<Tag color={status.scheduled && status.workerOnline ? 'green' : 'orange'}>{!status.scheduled ? 'Not scheduled' : status.workerOnline ? 'Scheduled' : 'Worker offline'}</Tag>}>
    <p>Every month on the <strong>1st at 02:00 IST</strong>, check NSE and BSE cash-equity listings and add newly listed stocks to the universe.</p>
    <Space wrap size={[24, 8]}><span className="muted">Next update: <strong>{status.nextRunAt ? dateLabel(status.nextRunAt) : 'Waiting for the data worker'}</strong></span><span className="muted">Last successful update: <strong>{status.lastSuccessAt ? dateLabel(status.lastSuccessAt) : 'Not yet updated'}</strong></span></Space>
    {status.addedListings !== null && <p className="muted">Last update added {status.addedCompanies ?? 0} new companies ({status.addedListings} listings).</p>}
    <p className="muted">New stocks still need your monthly rules and sufficient data to qualify. A missed update is checked when the worker starts again.</p>
    {(!status.workerOnline || status.lastError) && <Alert type="warning" showIcon title={status.lastError ?? 'Keep the data worker running for scheduled updates.'} />}
  </Card>;
}
