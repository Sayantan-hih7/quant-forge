import { useEffect } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useStrategyWorkspaceStore } from '../store/strategyWorkspaceStore';

export function useStrategyWorkspace() {
  const owner = useAuthStore((s) => s.session?.email ?? 'demo');
  const workspace = useStrategyWorkspaceStore((s) => s.workspaces[owner]);
  const initialize = useStrategyWorkspaceStore((s) => s.initialize);
  useEffect(() => { initialize(owner, Date.now()); }, [owner, initialize]);
  const base = workspace?.bases.find((item) => item.id === workspace.selectedBaseId) ?? workspace?.bases[0];
  return { owner, workspace, base };
}
