import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthIdentity, AuthSession, BrokerConnection, PendingAuth } from '../modules/auth/types';

const newSession = ({ email, name, role }: AuthIdentity): AuthSession => ({ email, name, role, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
interface AuthState {
  session: AuthSession | null;
  pending: PendingAuth | null;
  connections: Record<string, BrokerConnection>;
  begin: (identity: AuthIdentity, verifyMobile?: boolean) => void;
  verifyMobile: (code: string) => boolean;
  completeMfa: (code: string) => boolean;
  completeDemoPasskey: () => void;
  cancelVerification: () => void;
  connectBroker: (connection: BrokerConnection) => void;
  renewBroker: () => void;
  disconnectBroker: () => void;
  signOut: () => void;
}

// UI simulation only. Never put credentials, secrets or real access tokens here.
export const useAuthStore = create<AuthState>()(persist((set, get) => ({
  session: null,
  pending: null,
  connections: {},
  begin: (identity, verifyMobile = false) => {
    const normalized = { ...identity, email: identity.email.trim().toLowerCase() };
    if (verifyMobile) set({ session: null, pending: { ...normalized, step: 'mobile' } });
    else if (identity.role === 'admin') set({ session: null, pending: { ...normalized, step: 'mfa' } });
    else set({ session: newSession(normalized), pending: null });
  },
  verifyMobile: (code) => {
    const pending = get().pending;
    if (code !== '123456' || pending?.step !== 'mobile') return false;
    if (pending.role === 'admin') set({ pending: { ...pending, step: 'mfa' } });
    else set({ session: newSession(pending), pending: null });
    return true;
  },
  completeMfa: (code) => {
    const pending = get().pending;
    if (code !== '654321' || pending?.step !== 'mfa' || pending.role !== 'admin') return false;
    set({ session: newSession(pending), pending: null });
    return true;
  },
  completeDemoPasskey: () => {
    const pending = get().pending;
    if (pending?.step === 'mfa' && pending.role === 'admin') set({ session: newSession(pending), pending: null });
  },
  cancelVerification: () => set({ pending: null }),
  connectBroker: (connection) => {
    const session = get().session;
    if (session?.role !== 'client') return;
    set((s) => ({ connections: { ...s.connections, [session.email]: connection } }));
  },
  renewBroker: () => {
    const session = get().session;
    const connection = session && get().connections[session.email];
    if (!session || !connection) return;
    set((s) => ({ connections: { ...s.connections, [session.email]: { ...connection, expiresAt: Date.now() + 8 * 60 * 60 * 1000 } } }));
  },
  disconnectBroker: () => {
    const session = get().session;
    if (!session) return;
    const connections = { ...get().connections };
    delete connections[session.email];
    set({ connections });
  },
  signOut: () => set({ session: null, pending: null }),
}), {
  name: 'quantforge-demo-auth',
  version: 1,
  // Keep completed demo sessions across reloads; route guards enforce expiry.
  partialize: (state) => ({
    session: state.session,
    connections: state.connections,
  }),
}));
