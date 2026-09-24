import { useEffect } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useNow } from '../../../hooks/useNow';
import { monthKey } from '../../strategies/utils/monthlyCycle';
import { useQualificationStore } from '../store/qualificationStore';

export function useQualification() {
  const owner = useAuthStore((state) => state.session?.email ?? 'demo');
  const workspace = useQualificationStore((state) => state.workspaces[owner]);
  const initialize = useQualificationStore((state) => state.initialize);
  const now = useNow();
  useEffect(() => { initialize(owner, Date.now()); }, [owner, initialize]);
  const month = monthKey(now);
  return { owner, workspace, cache: workspace?.caches[month], month, now };
}
