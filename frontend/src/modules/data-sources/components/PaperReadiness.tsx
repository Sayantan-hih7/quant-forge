import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import { useState } from 'react';
import { Button, Card, List, Tag } from 'antd';
import { apiClient } from '../../../services/apiClient';
interface Check { id: string; label: string; state: 'ready' | 'attention'; message: string }
export function PaperReadiness() {
  const [checks, setChecks] = useState<Check[]>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <Card title="Paper-trading readiness" extra={<Button loading={busy} onClick={async () => {
    setBusy(true); setError('');
    try { setChecks((await apiClient.get<{ checks: Check[] }>('/system/readiness')).data.checks); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>Check readiness</Button>}>
    <p className="muted">Check connections and workers before a market session or deployment. This check does not start monitoring or place orders.</p>
    {error && <RequestFeedback type="error" title={error} />}
    {checks && <List dataSource={checks} renderItem={check => <List.Item extra={<Tag color={check.state === 'ready' ? 'green' : 'gold'}>{check.state === 'ready' ? 'Ready' : 'Check'}</Tag>}><List.Item.Meta title={check.label} description={check.message} /></List.Item>} />}
  </Card>;
}
