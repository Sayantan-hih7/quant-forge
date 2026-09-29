import { useEffect, useState } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { apiClient } from '../../../services/apiClient';
import type { SavedDashboardPreferences } from '../../dashboard/config/preferences';
import { DashboardSettingsForm } from './DashboardSettingsForm';
export function DashboardSettings() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; data?: SavedDashboardPreferences; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    void apiClient.get<SavedDashboardPreferences>('/dashboard/preferences', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setResult({ attempt, data }); }).catch(error => { if (!controller.signal.aborted) setResult({ attempt, error: (error as Error).message }); });
    return () => controller.abort();
  }, [attempt]);
  const reload = () => setAttempt(n => n + 1);
  if (result?.attempt !== attempt) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!result.data) return <Alert type="error" showIcon title="Dashboard settings could not be loaded" description={result.error} action={<Button onClick={reload}>Retry</Button>} />;
  return <DashboardSettingsForm key={attempt} initial={result.data} onReload={reload} />;
}
