import { useEffect, useState } from 'react';
import { App, Button, Card, Col, Row, Space, Tag } from 'antd';
import { apiClient } from '../../../services/apiClient';
interface Example { key: string; id: string; title: string; summary: string }
export function StrategyExamples({ savedIds, onSelect, onCreated }: { savedIds: string[]; onSelect: (id: string) => void; onCreated: () => Promise<void> }) {
  const [examples, setExamples] = useState<Example[]>([]), [busy, setBusy] = useState<string>();
  const { message } = App.useApp();
  useEffect(() => { const controller = new AbortController(); void apiClient.get<Example[]>('/strategies/examples', { signal: controller.signal }).then(r => setExamples(r.data)).catch(() => {}); return () => controller.abort(); }, []);
  return <section aria-label="Research strategies" className="mb-5"><Row gutter={[16, 16]}>{examples.map(example => <Col xs={24} lg={8} key={example.key}><Card size="small" style={{ height: '100%' }} title={example.title}>
    <p className="muted" style={{ minHeight: 60 }}>{example.summary}</p>
    <Space wrap><Tag>Research example</Tag><Button size="small" loading={busy === example.key} onClick={async () => {
      if (savedIds.includes(example.id)) { onSelect(example.id); return; }
      setBusy(example.key); try { const result = await apiClient.post<{ _id: string }>(`/strategies/examples/${example.key}`); await onCreated(); onSelect(result.data._id); } catch (error) { message.error((error as Error).message); } finally { setBusy(undefined); }
    }}>{savedIds.includes(example.id) ? 'Open strategy' : 'Create strategy'}</Button></Space>
  </Card></Col>)}</Row></section>;
}
