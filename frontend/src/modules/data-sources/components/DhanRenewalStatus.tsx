import { useState } from 'react';
import { Alert, App, Button, Space } from 'antd';
import { apiClient } from '../../../services/apiClient';
import type { DataStatus } from '../types';

export function DhanRenewalStatus({ connection, refresh, onSetup, busy }: {
  connection: DataStatus['dhan']; refresh: () => Promise<void>; onSetup: () => void; busy: boolean;
}) {
  const { message, modal } = App.useApp();
  const [saving, setSaving] = useState(false);
  async function toggle(enabled: boolean) {
    setSaving(true);
    try {
      await apiClient.patch('/connections/dhan/auto-renew', { enabled, webTokenConfirmed: enabled });
      await refresh(); message.success(enabled ? 'Automatic renewal enabled' : 'Automatic renewal stopped');
    } catch (error) { message.error((error as Error).message); }
    finally { setSaving(false); }
  }
  function enable() {
    if (connection.tokenSource === 'web') { void toggle(true); return; }
    modal.confirm({ title: 'Was this Access Token generated in Dhan Web?',
      content: 'Only tokens generated in Dhan Web can be renewed. A token obtained through Connect Dhan or copied from a redirect URL needs a new Dhan Web token instead.',
      okText: 'Yes, enable renewal', cancelText: 'Cancel', onOk: () => toggle(true) });
  }
  const active = connection.autoRenew && connection.connected && connection.renewalState !== 'login_required';
  const needsLogin = !connection.connected || connection.renewalState === 'login_required';
  const title = active ? connection.renewalState === 'scheduled' ? 'Automatic renewal is on' : 'Automatic renewal needs a retry'
    : needsLogin && connection.autoRenew ? 'Reconnect to resume automatic renewal' : 'Avoid reconnecting every day';
  return <Alert className="mt-5" showIcon type={active && connection.renewalState === 'scheduled' ? 'success' : connection.renewalError || needsLogin && connection.autoRenew ? 'warning' : 'info'} title={title}
    description={<Space orientation="vertical" size={8} style={{ width: '100%' }}>
      <span>{connection.renewalError ?? (active
        ? 'The backend renews your Dhan Web token 30 minutes before expiry and saves the replacement automatically.'
        : connection.tokenSource === 'oauth'
          ? 'Your browser-login token cannot be renewed. Set up once with an Access Token generated in Dhan Web.'
          : 'Connect once with a Dhan Web Access Token and enable automatic renewal.')}</span>
      {active && connection.nextRenewalAt && <span>{connection.renewalState === 'scheduled' ? 'Next renewal' : 'Next retry'}: {new Date(connection.nextRenewalAt).toLocaleString()}</span>}
      {connection.lastRenewedAt && <span>Last renewed: {new Date(connection.lastRenewedAt).toLocaleString()}</span>}
      <span className="muted">Keep the backend running with internet access. If a token expires while it is off, paste a fresh token to reconnect.</span>
      <Space wrap>
        {!active && <Button size="small" disabled={busy || saving} onClick={onSetup}>Set up automatic renewal</Button>}
        {!connection.autoRenew && connection.connected && connection.tokenSource !== 'oauth' && <Button size="small" loading={saving} disabled={busy} onClick={enable}>Enable for current Dhan Web token</Button>}
        {connection.autoRenew && <Button size="small" loading={saving} disabled={busy} onClick={() => { void toggle(false); }}>Turn off automatic renewal</Button>}
      </Space>
    </Space>} />;
}
