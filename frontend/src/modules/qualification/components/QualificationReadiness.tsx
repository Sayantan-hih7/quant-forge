import { Alert, Collapse, Space, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { monthlyFields } from '../config/monthlyFields';
import type { BackendScan, QualificationState } from '../types/backend';

export function QualificationReadiness({ readiness, run }: { readiness: NonNullable<QualificationState['readiness']>; run?: BackendScan }) {
  const missing = readiness.fields.filter(item => !item.withData);
  const partial = readiness.fields.some(item => item.withData < readiness.companies);
  const preparing = run?.stage && run.stage !== 'evaluating' && ['queued', 'running'].includes(run.status);
  const prepared = run?.preparation && run.status === 'completed';
  return <div className="mb-5">
    <Alert showIcon type={preparing ? 'info' : prepared ? run.unavailable ? 'warning' : 'success' : missing.length || !readiness.companies ? 'warning' : 'info'}
      title={preparing ? 'Preparing data for your saved rules' : prepared ? run.unavailable ? `${run.unavailable.toLocaleString()} stocks could not be decided with available data` : 'All stocks have a qualification decision' : !readiness.companies ? 'The stock universe has not been loaded' : missing.length ? 'Some data required by your saved rule is missing' : partial ? 'Your saved rule has partial data coverage' : 'Saved-rule input coverage'}
      description={<span>{preparing ? 'Required company reports and daily history are being cached before the scan. You can leave this page; progress is saved on the server.' : prepared ? 'Review the scan for each stock’s result and any missing reports or insufficient history. Stocks already ruled out by a condition do not need every remaining input downloaded.' : <>{missing.length ? `Not loaded: ${missing.map(item => monthlyFields[item.field]?.label ?? item.field).join(', ')}. ` : ''}Run saved rules to download missing supported inputs and then scan. Previously collected data is reused. <Link to="/data-sources">Manage data connection</Link></>}</span>} />
    <Collapse ghost size="small" items={[{ key: 'coverage', label: `View coverage across ${readiness.companies.toLocaleString()} companies`, children: <>
      <Space wrap>{readiness.fields.map(item => <Tag key={item.field} color={!item.withData ? 'orange' : undefined}>{monthlyFields[item.field]?.label ?? item.field}: {item.withData.toLocaleString()} / {readiness.companies.toLocaleString()}{item.requiredMonths ? ` · ${item.requiredMonths} monthly bars` : ''}</Tag>)}</Space>
      <p className="muted">History coverage requires enough consecutive monthly observations through last month. The forming month is excluded. Coverage refers to your saved rule; IPOs and missing company reports may remain unavailable.</p>
    </> }]} />
  </div>;
}
