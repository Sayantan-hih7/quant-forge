import { useEffect } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useQualificationStore } from '../store/qualificationStore';

// UI-only job clock. A future API will report these states from its worker queue.
// Mount at the shell so a scan continues while moving between workspace pages.
export function useScanRuntime() {
  const owner = useAuthStore((state) => state.session?.role === 'admin' ? state.session.email : null);
  const advance = useQualificationStore((state) => state.advanceScans);
  const interrupt = useQualificationStore((state) => state.interruptScans);
  useEffect(() => {
    if (!owner) return;
    const timer = window.setInterval(() => advance(owner, Date.now()), 1000);
    return () => { window.clearInterval(timer); interrupt(owner); };
  }, [owner, advance, interrupt]);
}
