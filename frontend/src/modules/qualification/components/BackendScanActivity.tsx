import { useState } from 'react';
import { Alert, App, Button, Card, Drawer, Progress, Select, Space, Steps, Table, Tag } from 'antd';
import { apiClient } from '../../../services/apiClient';
import type { BackendScan, QualificationState } from '../types/backend';
import { monthlyFields } from '../config/monthlyFields';

interface Result { _id: string; instrumentId: string; instrument?: { symbol: string; name?: string; exchange: string }; status: string; checks: { field: string; matched: boolean | null; reason?: string; code?: string; availableMonths?: number; requiredMonths?: number; left?: number; right?: number; evidence?: { source: string; sourceUrl: string; period?: string } }[] }
export function BackendScanActivity({ state, refresh }: { state: QualificationState; refresh: () => Promise<void> }) {
  const { message, modal } = App.useApp();
  const [review, setReview] = useState<BackendScan | null>(null), [rows, setRows] = useState<Result[]>([]), [total, setTotal] = useState(0), [busy, setBusy] = useState(false);
  const run = state.runs[0];
  const [filter, setFilter] = useState<string>();
  const [pageNumber, setPageNumber] = useState(1);
  async function load(scan: BackendScan, page = 1, status = filter) {
    setReview(scan); setPageNumber(page); setBusy(true);
    try { const response = await apiClient.get<{ rows: Result[]; total: number }>(`/qualification/runs/${scan._id}/results`, { params: { page, status: status || undefined } }); setRows(response.data.rows); setTotal(response.data.total); }
    catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  async function action(path: string, data = {}) {
    setBusy(true);
    try { await apiClient.post(path, data); await refresh(); }
    catch (error) { message.error((error as Error).message); } finally { setBusy(false); }
  }
  if (!run) return null;
  const active = ['queued', 'running'].includes(run.status);
  const preparing = active && !!run.stage && run.stage !== 'evaluating';
  const stages = ['checking', 'fundamentals', 'ownership', 'history', 'evaluating'];
  const stageLabels: Record<string, string> = { checking: 'Checking cached inputs', fundamentals: 'Loading company data', ownership: 'Checking exchange shareholding filings', history: 'Loading monthly history', evaluating: 'Evaluating saved rules' };
  const processed = preparing ? run.preparation?.processed ?? 0 : run.processed;
  const progressTotal = preparing ? run.preparation?.total ?? run.total : run.total;
  const completedLabel = run.unavailable ? 'Completed with data gaps' : run.awaitingHistory ? 'Completed · history pending' : 'Completed';
  return <>
    <Card size="small" className="mb-5" title="Latest monthly scan" extra={<Tag color={run.status === 'completed' ? run.unavailable ? 'orange' : run.awaitingHistory ? 'blue' : 'green' : run.status === 'failed' ? 'red' : 'blue'}>{preparing ? 'Preparing data' : run.status === 'completed' ? completedLabel : run.status}</Tag>}>
      {run.stage && active && <Steps size="small" className="mb-5" current={stages.indexOf(run.stage)} items={['Check cache', 'Company data', 'Shareholding', 'Price history', 'Scan rules'].map(title => ({ title }))} />}
      {preparing && state.providerRetryAt && <Alert className="mb-5" type="info" showIcon title="Waiting for Dhan’s rate limit" description={`Preparation will retry automatically after ${new Date(state.providerRetryAt).toLocaleTimeString()}. Downloaded data is retained.`} />}
      {preparing ? <p><strong>{stageLabels[run.stage!]}</strong> · {processed.toLocaleString()} / {progressTotal.toLocaleString()} stocks</p> : <Space wrap><span>{run.processed.toLocaleString()} stocks evaluated</span><Tag color="green">Qualified {run.qualified}</Tag><Tag>Rejected {run.rejected}</Tag><Tag color="orange">Missing data {run.unavailable}</Tag>{!!run.awaitingHistory && <Tag color="blue">Awaiting history {run.awaitingHistory}</Tag>}</Space>}
      {active && <Progress percent={progressTotal ? Math.floor(processed * 100 / progressTotal) : 0} status="active" />}
      {run.status === 'completed' && !!run.dataGaps?.length && <div className="my-4 rounded-lg border border-[var(--border)] p-4" aria-label="Missing data breakdown">
        <Space wrap className="mb-2"><strong>What still needs data</strong>{run.dataGaps.map(gap => <Tag key={gap.field}>{monthlyFields[gap.field]?.label ?? gap.field}: {gap.stocks}</Tag>)}</Space>
        <p className="muted">These stocks have no final decision. A stock can need more than one input. Retrying checks the exchanges for missing reports and reuses downloaded data.</p>
        <Space wrap className="mt-3"><Button size="small" onClick={() => { setFilter('unavailable'); void load(run, 1, 'unavailable'); }}>View affected stocks</Button>
          <Button size="small" disabled={!state.canRun} loading={busy} onClick={() => { void action('/qualification/runs'); }}>Retry missing data</Button></Space>
      </div>}
      {run.status === 'completed' && run.qualified === 0 && (run.unavailable > 0 || !!run.awaitingHistory) && <Alert className="my-3" type="warning" showIcon
        title="No confirmed matches — some stocks are still undecided"
        description={`${(run.unavailable + (run.awaitingHistory ?? 0)).toLocaleString()} stocks need missing data or more monthly history. Zero qualified does not mean every stock failed your rules.${state.universe && state.universe.runId !== run._id ? ` Your published list still contains ${state.universe.members.length.toLocaleString()} stocks. Publishing this result replaces its scan-qualified stocks with zero; manual additions are retained.` : ''}`} />}
      {run.preparation && <p className="muted">{run.preparation.downloaded.toLocaleString()} datasets downloaded · {run.preparation.cached.toLocaleString()} reused · {run.preparation.ruledOut.toLocaleString()} stocks ruled out before further downloads{run.preparation.failed ? ` · ${run.preparation.failed} provider requests unavailable` : ''}</p>}
      <p className="muted">{preparing ? 'Initial data loading can take time. The scan starts after preparation, using a new data snapshot.' : `Snapshot cutoff: ${new Date(run.cutoff).toLocaleString()}`} · {run.message ?? 'Published stocks change only after you review and publish a completed scan.'}</p>
      <Space wrap><Button disabled={preparing || run.processed === 0} loading={busy} onClick={() => { void load(run); }}>Review results</Button>
        {active && <Button danger onClick={() => { void action(`/qualification/runs/${run._id}/cancel`); }}>Cancel scan</Button>}
        {run.status === 'completed' && state.universe?.runId !== run._id && <Button type="primary" disabled={state.rule?.fingerprint !== run.fingerprint} loading={busy} onClick={() => modal.confirm({ title: 'Publish this month’s qualified list?', content: `${run.qualified} scan-qualified stocks. ${run.unavailable} stocks lack required data and ${run.awaitingHistory ?? 0} await monthly history; these stocks will be excluded. Manual additions are retained unless the scan now qualifies them.`, okText: 'Publish list', onOk: () => action(`/qualification/runs/${run._id}/publish`, { acknowledgeMissingData: true }) })}>Publish qualified list</Button>}
      </Space>
    </Card>
    <Drawer title="Monthly scan results" open={!!review} onClose={() => setReview(null)} size={760}>
      <Select className="mb-5" value={filter ?? 'all'} aria-label="Filter scan results" style={{ minWidth: 220 }} options={[{ value: 'all', label: 'All results' }, { value: 'qualified', label: 'Qualified stocks' }, { value: 'rejected', label: 'Did not match rules' }, { value: 'awaiting_history', label: 'Awaiting monthly history' }, { value: 'unavailable', label: 'Missing required data' }]} onChange={value => { const status = value === 'all' ? '' : value; setFilter(status || undefined); if (review) void load(review, 1, status); }} />
      {filter === 'awaiting_history' && <Alert className="mb-5" showIcon type="info" title="These stocks need more completed monthly candles" description="New listings can stay in the stock universe while history builds. For example, monthly EMA 21 needs at least 21 completed monthly candles. No daily substitute is used. Eligibility is checked on your next scan; it is not a promise that the stock will pass." />}
      {filter === 'unavailable' && <Alert className="mb-5" showIcon type="warning" title="Missing data is not a failed rule" description="Expand a stock to see which input is missing. Exchange reports are tried automatically. If no verified value is available, the stock stays undecided and is excluded from the scan-qualified list." />}
      <Table<Result> rowKey="_id" size="small" loading={busy} dataSource={rows} pagination={{ current: pageNumber, pageSize: 50, total, onChange: page => { if (review) void load(review, page); } }} columns={[
        { title: 'Stock', render: (_, row) => <><strong>{row.instrument?.symbol ?? row.instrumentId}</strong><div className="muted">{row.instrument?.name} {row.instrument?.exchange}</div></> }, { title: 'Result', dataIndex: 'status', render: (status: string) => <Tag color={status === 'qualified' ? 'green' : status === 'unavailable' ? 'orange' : status === 'awaiting_history' ? 'blue' : undefined}>{({ awaiting_history: 'Awaiting history', unavailable: 'Missing data', qualified: 'Qualified', rejected: 'Did not match' })[status] ?? status}</Tag> },
      ]} expandable={{ expandedRowRender: row => <Space orientation="vertical">{row.checks.map((check, i) => <div key={i}><Tag color={check.matched === true ? 'green' : check.matched === null ? 'orange' : 'red'}>{monthlyFields[check.field]?.label ?? check.field}</Tag>{check.reason ?? `${check.matched ? 'Passed' : 'Not matched'} · ${check.left?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) ?? '—'} / ${check.right ?? '—'}`}
        {check.evidence && <div className="muted mt-1"><a href={check.evidence.sourceUrl} target="_blank" rel="noreferrer">{check.evidence.source === 'nse-shareholding' ? 'NSE shareholding filing' : check.evidence.source === 'bse-shareholding' ? 'BSE shareholding filing' : 'View data source'}</a>{check.evidence.period ? ` · Report period ${check.evidence.period}` : ''}</div>}
      </div>)}</Space> }} />
    </Drawer>
  </>;
}
