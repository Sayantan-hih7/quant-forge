import { useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import type { SavedStrategy } from '../hooks/useBackendStrategies';
import { useBackendStrategies } from '../hooks/useBackendStrategies';
import { apiClient } from '../../../services/apiClient';

export function RestoreStrategyButton({ strategy, occupied }: { strategy: SavedStrategy; occupied: boolean }) {
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  const restore = async () => {
    if (busy || occupied || !strategy.archivedAt) return;
    setBusy(true);
    try {
      const { data } = await apiClient.post<SavedStrategy>(`/strategies/${strategy._id}/restore`, {
        expectedRevision: strategy.revision, expectedArchivedAt: strategy.archivedAt,
      });
      useBackendStrategies.setState(state => ({ strategies: state.strategies.map(row => row._id === data._id ? data : row) }));
      message.success('Strategy restored. Monitoring and paper trading remain stopped.');
      await useBackendStrategies.getState().refresh();
    } catch (error) {
      message.error((error as Error).message);
      await useBackendStrategies.getState().refresh();
    } finally { setBusy(false); }
  };
  return <Tooltip title={occupied ? 'Archive the current strategy of this type first.' : 'Restore without starting monitoring or trading.'}>
    <span className="strategy-restore-control"><Button icon={<UndoOutlined aria-hidden />} disabled={occupied} loading={busy} onClick={() => void restore()}>Restore strategy</Button></span>
  </Tooltip>;
}
