import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useNow } from '../hooks/useNow';
import { homeFor } from '../modules/auth/utils/routes';
import type { UserRole } from '../modules/auth/types';

export function EntryRedirect() {
  const session = useAuthStore((s) => s.session);
  const now = useNow();
  return <Navigate to={session && session.expiresAt > now ? homeFor(session) : '/login'} replace />;
}
export function PublicOnly() {
  const { session, pending } = useAuthStore();
  const now = useNow();
  if (session && session.expiresAt > now) return <Navigate to={homeFor(session)} replace />;
  if (pending) return <Navigate to="/auth/verify" replace />;
  return <Outlet />;
}
export function RoleGuard({ role }: { role: UserRole }) {
  const session = useAuthStore((s) => s.session);
  const now = useNow();
  if (!session || session.expiresAt <= now) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={homeFor(session)} replace />;
  return <Outlet />;
}
export function BrokerReadyGuard() {
  const { session, connections } = useAuthStore();
  if (!session || !connections[session.email]) return <Navigate to="/onboarding/broker" replace />;
  return <Outlet />;
}
