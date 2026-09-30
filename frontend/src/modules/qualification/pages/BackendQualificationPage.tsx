import '../../../styles/qualification.css';
import '../../../styles/monthly-qualification.css';
import { Alert, Button, Empty, Skeleton, Tabs, Tag } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useBackendQualification } from '../hooks/useBackendQualification';
import { SavedMonthlyRuleBuilder } from '../components/SavedMonthlyRuleBuilder';
import { BackendScanActivity } from '../components/BackendScanActivity';
import { BackendQualifiedStocks } from '../components/BackendQualifiedStocks';
import { ScanResults } from '../components/ScanResults';
import { QualificationReadiness } from '../components/QualificationReadiness';

export default function BackendQualificationPage() {
  const { data, stocks, capabilities, error, refresh } = useBackendQualification();
  const [params, setParams] = useSearchParams();
  const tab = ['rules', 'not-qualified'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'universe';
  const completed = data?.latestCompletedRun ?? data?.runs.find(run => run.status === 'completed');
  return <div className="qualification-page page-enter">
    <div className="page-heading"><div><h1>Stock qualification</h1><p>Save monthly rules, review a scan, and publish your stock list.</p></div><Tag color="blue">{data?.month ?? 'Current month'} · Local database</Tag></div>
    {error && <Alert className="mb-5" type="error" showIcon title="Qualification service unavailable" description={error} action={<Button onClick={() => { void refresh(); }}>Retry</Button>} />}
    {!data || !capabilities ? !error && <Skeleton active /> : <>
      <p className="muted">The full stock universe is checked for new listings on the 1st of each month at 02:00 IST. <Link to="/data-sources">View update status</Link></p>
      {data.readiness && <QualificationReadiness readiness={data.readiness} run={data.runs[0]?.fingerprint === data.rule?.fingerprint ? data.runs[0] : undefined} />}
      <BackendScanActivity state={data} refresh={refresh} />
      <div className="q-workspace"><Tabs activeKey={tab} onChange={tab => setParams({ tab })} destroyOnHidden={false} items={[
        { key: 'rules', label: 'Monthly rules', forceRender: true, children: <SavedMonthlyRuleBuilder visible={tab === 'rules'} state={data} capabilities={capabilities} refresh={refresh} /> },
        { key: 'universe', label: data.universe ? `Qualified stocks (${stocks.length})` : 'Qualified stocks', children: <BackendQualifiedStocks visible={tab === 'universe'} state={data} stocks={stocks} capabilities={capabilities} refresh={refresh} onRules={() => setParams({ tab: 'rules' })} /> },
        { key: 'not-qualified', label: 'Not qualified', children: <div className="monthly-rule-builder"><h2>Not qualified in the latest completed scan</h2>{completed ? <>{completed.fingerprint !== data.rule?.fingerprint && <Alert className="mb-5" type="warning" showIcon title="These results use earlier saved rules. Complete a new scan to evaluate your current rules." />}<ScanResults key={completed._id} run={completed} outsideUniverse onChanged={refresh} visible={tab === 'not-qualified'} /></> : <Empty description="Complete a monthly scan to review stocks that failed rules or need more data." />}</div> },
      ]} /></div>
    </>}
  </div>;
}
