import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Spin } from 'antd';
import { Link } from 'react-router-dom';
import { apiClient } from '../../../services/apiClient';

export default function DhanCallbackPage() {
  const [tokenId] = useState(() => new URLSearchParams(window.location.search).get('tokenId'));
  const [state, setState] = useState<'working' | 'connected' | 'error'>('working'), [error, setError] = useState('');
  const request = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    let active = true;
    window.history.replaceState(null, '', '/connections/dhan/callback');
    request.current ??= tokenId ? apiClient.post('/connections/dhan/complete', { tokenId }, { timeout: 65_000 }) : Promise.reject(new Error('Dhan did not return a consent token. Start a new connection from Connections & Data.'));
    void request.current.then(() => { if (active) setState('connected'); }).catch((e: Error) => { if (active) { setError(e.message); setState('error'); } });
    return () => { active = false; };
  }, [tokenId]);
  return <div className="loading-page"><Card title="Dhan data connection" style={{ maxWidth: 560 }}>
    {state === 'working' ? <Spin tip="Verifying Dhan login" /> : <Alert showIcon type={state === 'connected' ? 'success' : 'error'} title={state === 'connected' ? 'Dhan connected' : 'Connection not completed'} description={error || 'Your data session is verified. You can close this tab or return to Connections & Data.'} />}
    <Link to="/data-sources"><Button className="mt-5">Return to Connections & Data</Button></Link>
  </Card></div>;
}
