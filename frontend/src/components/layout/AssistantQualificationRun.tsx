import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Modal, Progress, Space, Tag } from 'antd';
import { apiClient } from '../../services/apiClient';
import type { QualificationState } from '../../modules/qualification/types/backend';
const ScanResults = lazy(() => import('../../modules/qualification/components/ScanResults').then(module => ({ default: module.ScanResults })));

export interface QualificationChatState {resultsId?:string;publishRunId?:string;confirmPublish:boolean;acknowledged:boolean}
export default function AssistantQualificationRun({ revision, visible, initialState,onStateChange }: { revision: number; visible: boolean;initialState?:QualificationChatState;onStateChange?:(state:QualificationChatState)=>void }) {
  const [state, setState] = useState<QualificationState>(), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [resultsId, setResultsId] = useState<string|undefined>(initialState?.resultsId);
  const [confirmPublish, setConfirmPublish] = useState(initialState?.confirmPublish??false), [acknowledged, setAcknowledged] = useState(initialState?.acknowledged??false);
  const [publishRunId,setPublishRunId]=useState(initialState?.publishRunId);
  const results=state?.runs.find(item=>item._id===resultsId);
  const callback=useRef(onStateChange);useLayoutEffect(()=>{callback.current=onStateChange;},[onStateChange]);
  useEffect(()=>{callback.current?.({resultsId,publishRunId,confirmPublish,acknowledged});},[resultsId,publishRunId,confirmPublish,acknowledged]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const { data } = await apiClient.get<QualificationState>('/qualification', { signal }); if (!signal?.aborted) { setState(data); setError(''); } }
    catch (e) { if (!signal?.aborted) setError((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 5000); };
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh, visible]);
  const run = state?.runs.find(item => confirmPublish&&publishRunId ? item._id===publishRunId : item.revision === revision);
  const currentRevision = state?.rule?.revision === revision;
  const active = state?.runs.some(item => item.status === 'queued' || item.status === 'running');
  const published = !!run && state?.universe?.runId === run._id;
  const gaps = (run?.unavailable ?? 0) + (run?.awaitingHistory ?? 0);
  const action = async (kind: 'run' | 'cancel' | 'publish') => {
    if (busy) return; setBusy(true); setError('');
    try {
      if (kind === 'run') await apiClient.post('/qualification/runs', { expectedRevision: revision });
      else if (run) await apiClient.post(`/qualification/runs/${run._id}/${kind}`, kind === 'publish' ? { acknowledgeMissingData: acknowledged } : {});
      if (kind === 'publish') setConfirmPublish(false);
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section aria-label="Qualification scan in assistant" style={{ borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: 12 }}>
    <strong>Qualification scan · saved revision {revision}</strong>
    {error && <Alert type="error" title="Scan action not confirmed" description={error} action={<Button onClick={() => void refresh()}>Refresh status</Button>} />}
    {state && !currentRevision && <Alert type="warning" title="The monthly rule has changed" description="Start a new conversation to load the latest rules before scanning." />}
    {run && <div style={{ margin: '8px 0' }}><Tag>{published ? 'Published' : run.status}</Tag><span>{run.processed} / {run.total} stocks checked</span>{['queued', 'running'].includes(run.status) && <Progress percent={run.total ? Math.round(run.processed / run.total * 100) : 0} size="small" />}<p>{run.qualified} passed · {run.rejected} did not match · {run.unavailable} missing data · {run.awaitingHistory ?? 0} awaiting history</p>{run.message && <p>{run.message}</p>}</div>}
    <Space wrap>
      <Button disabled={busy || !state?.canRun || !currentRevision || active} loading={busy} onClick={() => void action('run')}>Run qualification scan</Button>
      {run && ['queued', 'running'].includes(run.status) && <Button disabled={busy} onClick={() => void action('cancel')}>Cancel scan</Button>}
      {run?.status === 'completed' && <Button onClick={() => setResultsId(run._id)}>Review scan results</Button>}
      {run?.status === 'completed' && !published && <Button disabled={busy || !currentRevision} onClick={() => { setPublishRunId(run._id);setAcknowledged(false); setConfirmPublish(true); }}>Publish qualified stocks</Button>}
    </Space>
    <Modal title="Qualification scan results" open={!!results&&visible} width={1100} footer={<Button onClick={() => setResultsId(undefined)}>Back to assistant</Button>} onCancel={() => setResultsId(undefined)} destroyOnHidden styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}>
      {results && <Suspense fallback={<p>Loading results...</p>}><ScanResults run={results} onChanged={() => refresh()} /></Suspense>}
    </Modal>
    <Modal title="Publish these qualified stocks?" open={confirmPublish&&visible} okText="Publish list" confirmLoading={busy} okButtonProps={{ disabled: !run || !currentRevision || (!!gaps && !acknowledged) }} cancelButtonProps={{ disabled: busy }} closable={!busy} mask={{ closable: !busy }} onCancel={() => { if (!busy) setConfirmPublish(false); }} onOk={() => void action('publish')}>
      <p>Replace the published scan list with the {run?.qualified ?? 0} stocks that passed revision {revision}. This does not start trading.</p>
      {!!gaps && <Checkbox checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}>I reviewed the {gaps} stocks with missing inputs or insufficient history. They will not be included as scan-qualified stocks.</Checkbox>}
      {error && <Alert type="error" title="Publish not confirmed" description={error} />}
    </Modal>
  </section>;
}

