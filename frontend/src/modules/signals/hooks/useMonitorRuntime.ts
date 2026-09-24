import { useEffect } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useSignalMonitorStore } from '../store/signalMonitorStore';

export function useMonitorRuntime() {
  const owner = useAuthStore(state => state.session?.role === 'admin' ? state.session.email : undefined);
  const tick = useSignalMonitorStore(state => state.tick);
  const interrupt = useSignalMonitorStore(state => state.interrupt);
  useEffect(() => {
    if (!owner) return;
    const timer = window.setInterval(() => tick(owner, Date.now()), 1000);
    return () => { window.clearInterval(timer); interrupt(owner); };
  }, [owner, tick, interrupt]);
}
