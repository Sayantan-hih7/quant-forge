import { Schema, model } from 'mongoose';
export interface Connection {
  _id: string; encryptedToken?: string; expiresAt?: string; status: 'connected' | 'expired' | 'disconnected';
  reconnectState?: 'checking' | 'connected' | 'retrying' | 'login_required'; reconnectCheckedAt?: string; reconnectAt?: string; reconnectError?: string;
  dataPlan?: string; dataValidity?: string; verifiedAt?: string; consentExpiresAt?: string;
  tokenSource?: 'web' | 'oauth' | 'unknown'; autoRenew?: boolean;
  renewalState?: 'off' | 'scheduled' | 'verifying' | 'retrying' | 'login_required';
  nextRenewalAt?: string; lastRenewedAt?: string; renewalError?: string;
}
const schema = new Schema<Connection>({
  _id: String, encryptedToken: { type: String, select: false }, expiresAt: String,
  status: { type: String, enum: ['connected', 'expired', 'disconnected'], default: 'disconnected' },
  reconnectState: { type: String, enum: ['checking', 'connected', 'retrying', 'login_required'] }, reconnectCheckedAt: String, reconnectAt: String, reconnectError: String,
  dataPlan: String, dataValidity: String, verifiedAt: String, consentExpiresAt: String,
  tokenSource: { type: String, enum: ['web', 'oauth', 'unknown'] }, autoRenew: Boolean,
  renewalState: { type: String, enum: ['off', 'scheduled', 'verifying', 'retrying', 'login_required'] },
  nextRenewalAt: String, lastRenewedAt: String, renewalError: String,
}, { versionKey: false, strict: 'throw' });
export const ConnectionModel = model<Connection>('Connection', schema, 'connections');
