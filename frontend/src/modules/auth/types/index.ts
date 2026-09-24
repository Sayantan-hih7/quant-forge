export type UserRole = 'admin' | 'client';

export interface AuthIdentity {
  email: string;
  name: string;
  role: UserRole;
}
export interface AuthSession extends AuthIdentity {
  expiresAt: number;
}
export interface PendingAuth extends AuthIdentity {
  step: 'mobile' | 'mfa';
}
export interface BrokerConnection {
  brokerId: string;
  clientId: string;
  method: 'credentials' | 'oauth';
  connectedAt: number;
  expiresAt: number;
  capital: number;
  dailyLoss: number;
  multiplier: number;
}
