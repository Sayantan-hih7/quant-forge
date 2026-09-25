import { Alert, Collapse, Space, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { monthlyFields } from '../config/monthlyFields';
import type { BackendScan, QualificationState } from '../types/backend';

export function QualificationReadiness({ readiness, run }: { readiness: NonNullable<QualificationState['readiness']>; run?: BackendScan }) {
  const missing = readiness.fields.filter(item => !item.withData);
  const partial = readiness.fields.some(item => item.withData < readiness.companies);
  const preparing = run?.stage && run.stage !== 'evaluating' && ['queued', 'running'].includes(run.status);
  const prepared = run?.preparation && run.status === 'completed';
  const undecided = (run?.unavailable ?? 0) + (run?.awaitingHistory ?? 0);
  const missingNames = missing.map(item => monthlyFields[item.field]?.label ?? item.field).join(', ');
  return <div className="mb-5">
    <Alert showIcon type={preparing ? 'info' : prepared ? run.unavailable ? 'warning' : run.awaitingHistory ? 'info' : 'success' : missing.length || !readiness.companies ? 'warning' : 'info'}
      title={preparing ? 'Preparing data for your saved rules' : prepared ? undecided ? `${undecided.toLocaleString()} stocks still need data or monthly history` : 'All stocks have a qualification decision' : !readiness.companies ? 'The stock universe has not been loaded' : missing.length ? 'Some data required by your saved rule is missing' : partial ? 'Your saved rule has partial data coverage' : 'Saved-rule input coverage'}
      description={<span>{preparing ? 'Required company reports and daily history are being cached before the scan. You can leave this page; progress is saved on the server.' : prepared ? <>
        {missing.length > 0 && readiness.companies > 0 && <><strong>No currently available data for {missingNames} across {readiness.companies.toLocaleString()} companies.</strong> Conditions using these values cannot be confirmed. Repeating a scan cannot fill values the provider does not supply. </>}
        Review the scan for each stock’s result and any missing reports or insufficient history. Stocks already ruled out by a condition do not need every remaining input downloaded.
      </> : <>{missing.length ? `Not loaded: ${missingNames}. ` : ''}Run saved rules to download missing supported inputs and then scan. Previously collected data is reused. <Link to="/data-sources">Manage data connection</Link></>}</span>} />
    <Collapse ghost size="small" items={[{ key: 'coverage', label: `View coverage across ${readiness.companies.toLocaleString()} companies`, children: <>
      <Space wrap>{readiness.fields.map(item => <Tag key={item.field} color={!item.withData ? 'orange' : undefined}>{monthlyFields[item.field]?.label ?? item.field}: {item.withData.toLocaleString()} / {readiness.companies.toLocaleString()}{item.requiredMonths ? ` · ${item.requiredMonths} monthly bars` : ''}</Tag>)}</Space>
      <p className="muted">History coverage requires enough consecutive monthly observations through last month. The forming month is excluded. New listings join through the monthly universe refresh. They wait only for the history your rule needs: EMA 21 needs 21 completed monthly candles, while a fundamentals-only rule needs no monthly price history. Missing provider data is reported separately.</p>
    </> }]} />
  </div>;
}
