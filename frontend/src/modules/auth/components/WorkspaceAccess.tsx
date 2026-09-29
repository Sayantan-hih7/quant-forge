import { useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Alert, Button, Card, Form, Space, Spin, Typography } from 'antd';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfInput, RhfPassword } from '../../../components/forms';
import { useWorkspaceSession } from '../../../store/workspaceSession';

const schema = z.object({ email: z.string().email('Enter your workspace email'), password: z.string().min(1, 'Enter your password').max(256) });
export function WorkspaceAccess({ children }: { children: ReactNode }) {
  const { hosted, authenticated, setSession } = useWorkspaceSession();
  const [checking, setChecking] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  useEffect(() => {
    const controller = new AbortController();
    void axios.get('/api/session', { withCredentials: true, timeout: 15000, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setError(''); setSession(data.mode === 'owner', data.authenticated === true); } })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to reach your workspace. Check that the backend is running, then retry.'); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [setSession, attempt]);
  if (!checking && !hosted && !error || !checking && authenticated) return children;
  return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <Card style={{ width: '100%', maxWidth: 420 }}>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <div><Typography.Title level={3}>QuantForge</Typography.Title><Typography.Text type="secondary">Your private paper-trading workspace</Typography.Text></div>
        {checking ? <Spin aria-label="Checking workspace session" /> : hosted ? <Form layout="vertical" onFinish={form.handleSubmit(async values => {
          setError('');
          try { await axios.post('/api/session/login', values, { withCredentials: true, timeout: 20000 }); form.resetField('password'); setSession(true, true); }
          catch (e) { setError(axios.isAxiosError(e) ? e.response?.data?.message ?? 'Sign-in unavailable. Try again.' : 'Sign-in unavailable. Try again.'); }
        })}>
          <RhfInput name="email" control={form.control} label="Email" autoComplete="username" />
          <RhfPassword name="password" control={form.control} label="Password" autoComplete="current-password" />
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" block loading={form.formState.isSubmitting}>Sign in</Button>
        </Form> : <><Alert type="error" title={error} /><Button onClick={() => { setChecking(true); setAttempt(value => value + 1); }}>Retry connection</Button></>}
      </Space>
    </Card>
  </main>;
}
