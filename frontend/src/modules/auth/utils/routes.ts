import type { AuthSession } from '../types';
export function homeFor(session: AuthSession | null) {
  return session?.role === 'admin' ? '/admin/dashboard' : session ? '/client/dashboard' : '/login';
}
