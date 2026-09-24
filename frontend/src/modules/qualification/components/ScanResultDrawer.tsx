import { Alert, Button, Drawer, Table, Tag } from 'antd';
import type { ScanJob } from '../types';
import { StockIndexTags } from './StockIndexTags';
import { QualificationSourceTag } from './QualificationSourceTag';
import { formatMonth } from '../../strategies/utils/monthlyCycle';

export function ScanResultDrawer({ job, month, replacementCount, onClose, onPublish, onDiscard }: {
  job: ScanJob | null; month: string; replacementCount?: number; onClose: () => void; onPublish: () => void; onDiscard: () => void;
}) {
  const canPublish = job?.kind === 'monthly' && job.rules[0].tier === 'monthly' && job.status === 'ready' && job.month === month;
  const manualCount = job?.result?.candidates.filter((stock) => stock.qualificationSource === 'manual').length ?? 0;
  return <Drawer open={!!job} onClose={onClose} title="Review scan results" size={720} footer={<div className="q-scan-result-actions"><Button onClick={onClose}>Close</Button>{job?.status === 'ready' && <Button onClick={onDiscard}>Discard result</Button>}{canPublish && <Button type="primary" onClick={onPublish}>Publish monthly universe</Button>}</div>}>
    {job?.result && <><div className="q-scan-result-heading"><Tag color="blue">MONTHLY QUALIFICATION</Tag><h3>{job.result.candidates.length} candidates in proposed list</h3><p>{job.result.candidates.length - manualCount} from scan · {manualCount} manual {manualCount === 1 ? 'inclusion' : 'inclusions'} retained</p><p>Saved monthly conditions · {formatMonth(job.month)}</p><p>{job.scopeCount.toLocaleString('en-IN')} stocks checked{job.dataMonth && ` · Monthly data through ${formatMonth(job.dataMonth)}`}</p></div>
      <Alert className="q-scan-result-note" showIcon type={!job.result.candidates.length || (canPublish && replacementCount !== undefined) ? 'warning' : 'info'} title={canPublish ? replacementCount !== undefined ? `Replace the ${replacementCount}-stock list for ${formatMonth(job.month)}?` : 'Ready for your review' : 'Saved scan result'} description={canPublish ? `${!job.result.candidates.length ? 'No stocks matched. Publishing an empty list leaves no candidates for trading rules. ' : ''}${replacementCount !== undefined ? 'Signals tied to the previous list will need a new scan. ' : ''}Publishing makes this list the current qualification universe.` : 'This result does not change the published list.'} />
      {manualCount > 0 && <p className="q-manual-help">Includes {manualCount} manually added {manualCount === 1 ? 'stock' : 'stocks'} retained from this month's published list. These remain custom selections, not confirmed monthly rule matches.</p>}
      <Table rowKey="symbol" size="small" dataSource={job.result.candidates} scroll={{ x: 600 }} pagination={{ pageSize: 8, showSizeChanger: false }} columns={[{ title: 'Stock', key: 'stock', width: 255, render: (_, stock) => <div className="q-stock-cell"><strong>{stock.symbol}</strong><small>{stock.name}</small><QualificationSourceTag stock={stock} /><StockIndexTags indices={stock.indices} membershipMonth={job.month} /></div> }, { title: 'Sector', dataIndex: 'sector' }, { title: 'Debt / equity', dataIndex: 'debtEquity', align: 'right' }]} locale={{ emptyText: 'No candidates passed the scanned rule.' }} />
    </>}
  </Drawer>;
}
