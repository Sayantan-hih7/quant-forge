import { useState } from 'react';
import { Alert, App, Button, Card, Form, Modal, Space, Tag } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiClient } from '../../../services/apiClient';
import type { DataStatus } from '../types';
import { RhfPassword, RhfSwitch } from '../../../components/forms';
import { DhanRenewalStatus } from './DhanRenewalStatus';

const schema = z.object({ token: z.string().trim().min(20, 'Paste the complete token, login code or redirect URL').max(8192), autoRenew: z.boolean() })
  .refine(value => !value.autoRenew || /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.token), {
    path: ['token'], message: 'Automatic renewal needs a Dhan Web Access Token, not a redirect URL or login code.',
  });
export function DhanConnection({ connection, refresh }: { connection: DataStatus['dhan']; refresh: () => Promise<void> }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false), [tokenOpen, setTokenOpen] = useState(false);
  const [error, setError] = useState(''), [loginStarted, setLoginStarted] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { token: '', autoRenew: false } });
  function openToken(autoRenew = false) { form.reset({ token: '', autoRenew }); setError(''); setTokenOpen(true); }
  async function login() {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setBusy(true);
    try {
      const { data } = await apiClient.post<{ loginUrl: string }>('/connections/dhan/login');
      if (tab) tab.location.href = data.loginUrl; else window.location.assign(data.loginUrl);
      setLoginStarted(true);
      message.info('Complete the Dhan login in the opened tab. If it opens another app, copy the final URL and paste it here.');
    } catch (e) { tab?.close(); message.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveToken(values: z.infer<typeof schema>) {
    setBusy(true); setError('');
    try { await apiClient.post('/connections/dhan/token', values, { timeout: 65_000 }); form.reset(); setTokenOpen(false); setLoginStarted(false); await refresh(); message.success('Dhan data connection verified'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <>
    <Card title="Dhan · historical & company data" extra={<Tag color={connection.connected ? 'green' : 'orange'}>{connection.connected ? 'Connected' : 'Login required'}</Tag>}>
      <p className="muted">Daily and intraday candles, market cap, valuation ratios, sector and reported shareholding. Credentials stay on the backend.</p>
      {connection.connected && <p>Token expires: {connection.expiresAt ? new Date(connection.expiresAt).toLocaleString() : '—'} · Data plan: {connection.dataPlan ?? 'Unknown'}</p>}
      <Space wrap>
        <Button type="primary" icon={<LinkOutlined />} loading={busy} disabled={!connection.apiConfigured} onClick={() => { void login(); }}>Connect Dhan</Button>
        <Button disabled={busy} onClick={() => { openToken(); }}>Paste token or login code</Button>
        {connection.connected && <Button danger disabled={busy} onClick={async () => { setBusy(true); try { await apiClient.delete('/connections/dhan'); await refresh(); } catch (e) { message.error((e as Error).message); } finally { setBusy(false); } }}>Disconnect</Button>}
      </Space>
      <DhanRenewalStatus connection={connection} refresh={refresh} busy={busy} onSetup={() => { openToken(true); }} />
      {loginStarted && !connection.connected && <Alert className="mt-5" type="info" showIcon title="Finish your Dhan login" description="After signing in, this page will update when Dhan returns here. If the redirect opens your previous app or an error page, copy its full address (including tokenId) and use Paste token or login code." />}
    </Card>
    <Modal open={tokenOpen} title="Complete Dhan connection" onCancel={() => { setTokenOpen(false); form.reset(); setError(''); }} closable={!busy} maskClosable={!busy} keyboard={!busy} footer={null} destroyOnHidden>
      <Alert type="info" showIcon title="Paste a login result or an access token" description="Use the redirect URL or tokenId from your completed Dhan login, or the full Access Token from Dhan Web. Login codes are exchanged automatically. API keys and API secrets do not go here." />
      {error && <Alert className="mt-5" type="error" showIcon title="Dhan connection failed" description={error} />}
      <Form layout="vertical" className="mt-5" onFinish={form.handleSubmit(saveToken)}>
        <RhfPassword name="token" control={form.control} label="Access token, login code or redirect URL" autoComplete="off" disabled={busy} />
        <RhfSwitch name="autoRenew" control={form.control} label="This token is from Dhan Web — renew automatically" disabled={busy} />
        <p className="muted">For automatic renewal: Dhan Web → My Profile → Access DhanHQ APIs → Generate Access Token. Paste that token here once. The backend must stay running; browser-login codes cannot be renewed.</p>
        <Button type="primary" htmlType="submit" loading={busy}>Verify and connect</Button>
      </Form>
    </Modal>
  </>;
}
