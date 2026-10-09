import { ResourcePlaceholder } from '../../../components/feedback/ResourcePlaceholder';
import { GuidanceNote } from '../../../components/feedback/GuidanceNote';
import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import { useState } from 'react';
import { App, Button, Card, Col, Descriptions, Progress, Row, Space, Statistic, Table, Tag } from 'antd';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useDataSources } from '../hooks/useDataSources';
import { DhanConnection } from '../components/DhanConnection';
import { HistoricalImport } from '../components/HistoricalImport';
import { MotilalConnection } from '../components/MotilalConnection';
import { apiClient } from '../../../services/apiClient';
import type { SourceRun } from '../types';
import { UniverseRefreshStatus } from '../components/UniverseRefreshStatus';
import { PaperReadiness } from '../components/PaperReadiness';
import { ScheduledRefreshes } from '../components/ScheduledRefreshes';

export default function DataSourcesPage() {
  const { data, error, loading, refresh } = useDataSources();
  const [queued, setQueued] = useState<string[]>([]);
  const { message } = App.useApp();
  const [month] = useState(() => { const local = new Date(Date.now() + 19800000); return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); });
  async function sync(kind: string, exchange?: string) {
    const key = `${kind}:${exchange ?? ''}`; setQueued(s => [...s, key]);
    try {
      await apiClient.post('/market-data/imports', { kind, ...(exchange ? { exchange, month } : {}) });
      message.info('Import queued. Progress and any missing data will appear below.'); await refresh();
    } catch (e) { message.error((e as Error).message); }
    finally { setQueued(s => s.filter(x => x !== key)); }
  }
  return <div className="page-enter">
    <div className="page-heading"><div><h1>Connections & Data</h1><p>Connect market data and check that your stock universe is up to date.</p></div><Button icon={<ReloadOutlined />} onClick={() => { void refresh(); }}>Refresh</Button></div>
    {error && <RequestFeedback type="error" showIcon title="Could not refresh Connections & Data" description={error} className="mb-5" />}
    {!data ? <ResourcePlaceholder loading={loading} label="Connections & Data" onRetry={()=>void refresh()}/> : <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      <GuidanceNote type="info" showIcon title="Paper trading only" description="These imports read market data. No broker orders are submitted. Existing design-preview screens remain separate until their backend connection is enabled." />
      <Row gutter={[16, 16]}><Col xs={24} md={8}><Card><Statistic title="Cash-equity listings · NSE + BSE" value={data.listings} /></Card></Col><Col xs={24} md={8}><Card><Statistic title="Distinct companies · ISIN" value={data.companies} /></Card></Col><Col xs={24} md={8}><Card><Statistic title="Stored historical candles" value={data.summaries && !data.summaries.candles.updatedAt ? (data.summaries.candles.state === 'refreshing' ? 'Counting' : 'Unavailable') : data.candles.reduce((s, x) => s + x.count, 0)} /></Card></Col></Row>
      {data.summaries && <p className="muted" role="status">{Object.entries(data.summaries).map(([key, summary]) => {
        const label = key === 'candles' ? 'Candle totals' : 'Collected fields';
        const timestamp = summary.updatedAt ? ` Last counted ${new Date(summary.updatedAt).toLocaleTimeString()}.` : '';
        return `${label}: ${summary.state === 'refreshing' ? 'counting in background' : summary.state === 'unavailable' ? 'summary unavailable; retrying automatically' : 'up to date'}.${timestamp}`;
      }).join(' ')}</p>}
      <DhanConnection connection={data.dhan} refresh={refresh} />
      {data.universeRefresh && <UniverseRefreshStatus status={data.universeRefresh} />}
      {!!data.maintenance?.length && <ScheduledRefreshes tasks={data.maintenance} closes={data.dailyCloses ?? null} workerOnline={data.universeRefresh?.workerOnline} />}
      <MotilalConnection />
      <PaperReadiness />
      <HistoricalImport data={data} refresh={refresh} />
      <Card title="Exchange and instrument imports" extra={<Tag>Completed month: {month}</Tag>}>
        <p className="muted">Index tags and company snapshots are dated when collected. Monthly delivery is volume-weighted across the complete set of exchange reports.</p>
        <Space wrap>{[
          ['instruments', 'Instrument master'], ['motilal-mappings', 'Motilal instrument mappings'], ['memberships', 'NSE / BSE index tags'], ['pledge', 'Promoter pledge'],
          ['delivery', 'NSE delivery', 'NSE'], ['delivery', 'BSE delivery', 'BSE'], ['fundamentals', 'Dhan company metrics'], ['daily-closes', 'Recent daily closes'],
        ].map(([kind, label, exchange]) => <Button key={label} icon={<DownloadOutlined />} loading={queued.includes(`${kind}:${exchange ?? ''}`)} disabled={kind !== 'instruments' && !data.listings || kind === 'fundamentals' && !data.dhan.connected} onClick={() => { void sync(kind, exchange); }}>{label}</Button>)}</Space>
      </Card>
      <Card title="Import activity"><Table<SourceRun> size="small" rowKey="_id" dataSource={data.recentRuns} pagination={{ pageSize: 6 }} scroll={{ x: 650 }} columns={[
        { title: 'Source', dataIndex: 'source' },
        { title: 'Status', dataIndex: 'status', render: (status: string) => <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : status === 'partial' ? 'orange' : 'blue'}>{status}</Tag> },
        { title: 'Progress', render: (_, row) => row.status === 'running' ? <Progress size="small" percent={row.total ? Math.floor(100 * row.processed / row.total) : 0} status="active" /> : `${row.processed.toLocaleString()}${row.total ? ` / ${row.total.toLocaleString()}` : ''}` },
        { title: 'Started', dataIndex: 'startedAt', render: (date: string) => new Date(date).toLocaleString() },
      ]} expandable={{ rowExpandable: row => !!row.failures.length || !!row.details, expandedRowRender: row => <>{row.failures.map((e, i) => <p key={i}><Tag color="red">{e.item}</Tag>{e.message}</p>)}{row.details && <Descriptions column={1} size="small" items={Object.entries(row.details).filter(([, v]) => typeof v !== 'object').map(([key, value]) => ({ key, label: key, children: String(value) }))} />}</> }} /></Card>
      <Card title="Collected fields"><Table size="small" rowKey="_id" dataSource={data.coverage} locale={{ emptyText: data.summaries && !data.summaries.coverage.updatedAt ? (data.summaries.coverage.state === 'refreshing' ? 'Counting collected fields?' : 'Field summary temporarily unavailable') : 'No collected fields' }} pagination={{ pageSize: 8 }} columns={[{ title: 'Field', dataIndex: '_id' }, { title: 'Listings with observations', dataIndex: 'instruments' }, { title: 'Latest observation', dataIndex: 'latestObservation', render: (date: string) => new Date(date).toLocaleString() }]} /><p className="muted">Observation counts are not a promise that every value is fresh or that every stock can pass a rule.</p></Card>
      <Card title="Coverage notes">{data.limitations.map(note => <p key={note} className="muted">{note}</p>)}</Card>
    </Space>}
  </div>;
}
