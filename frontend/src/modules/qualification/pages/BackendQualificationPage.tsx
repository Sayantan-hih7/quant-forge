import '../../../styles/qualification.css';
import '../../../styles/monthly-qualification.css';
import { Alert, Button, Skeleton, Tabs, Tag } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useBackendQualification } from '../hooks/useBackendQualification';
import { SavedMonthlyRuleBuilder } from '../components/SavedMonthlyRuleBuilder';
import { BackendScanActivity } from '../components/BackendScanActivity';
import { BackendQualifiedStocks } from '../components/BackendQualifiedStocks';
import { QualificationReadiness } from '../components/QualificationReadiness';

export default function BackendQualificationPage() {
  const { data, stocks, capabilities, error, refresh } = useBackendQualification();
  const [params, setParams] = useSearchParams();
  return <div className="qualification-page page-enter">
    <div className="page-heading"><div><h1>Stock qualification</h1><p>Save monthly rules, review a scan, and publish your stock list.</p></div><Tag color="blue">{data?.month ?? 'Current month'} · Local database</Tag></div>
    {error && <Alert className="mb-5" type="error" showIcon title="Qualification service unavailable" description={error} action={<Button onClick={() => { void refresh(); }}>Retry</Button>} />}
    {!data || !capabilities ? !error && <Skeleton active /> : <>
      <p className="muted">The full stock universe is checked for new listings on the 1st of each month at 02:00 IST. <Link to="/data-sources">View update status</Link></p>
      {data.readiness && <QualificationReadiness readiness={data.readiness} run={data.runs[0]?.fingerprint === data.rule?.fingerprint ? data.runs[0] : undefined} />}
      <BackendScanActivity state={data} refresh={refresh} />
      <div className="q-workspace"><Tabs activeKey={params.get('tab') === 'rules' ? 'rules' : 'universe'} onChange={tab => setParams({ tab })} destroyOnHidden={false} items={[
        { key: 'rules', label: 'Monthly rules', forceRender: true, children: <SavedMonthlyRuleBuilder state={data} capabilities={capabilities} refresh={refresh} /> },
        { key: 'universe', label: data.universe ? `Qualified stocks (${stocks.length})` : 'Qualified stocks', children: <BackendQualifiedStocks visible={params.get('tab') !== 'rules'} state={data} stocks={stocks} capabilities={capabilities} refresh={refresh} onRules={() => setParams({ tab: 'rules' })} /> },
      ]} /></div>
    </>}
  </div>;
}
