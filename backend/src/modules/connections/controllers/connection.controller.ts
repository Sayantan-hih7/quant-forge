import type { Request, Response } from 'express';
import { beginDhanLogin, finishDhanLogin, saveDhanToken, connectDhanCredential, disconnectDhan } from '../services/dhan.service.js';
import { dhanConsentSchema, dhanAccessTokenSchema, dhanAutoRenewSchema } from '../validations/connection.validation.js';
import { setDhanAutoRenew } from '../services/dhan-renewal.service.js';
import { invariant } from '../../../shared/errors.js';

export async function beginDhan(_req: Request, res: Response) { res.json(await beginDhanLogin()); }
export async function completeDhan(req: Request, res: Response) {
  const { tokenId } = dhanConsentSchema.parse(req.body);
  res.json(await finishDhanLogin(tokenId));
}
export async function connectDhanToken(req: Request, res: Response) {
  const { token, autoRenew } = dhanAccessTokenSchema.parse(req.body);
  res.json(await connectDhanCredential(token, autoRenew));
}
export async function updateDhanAutoRenew(req: Request, res: Response) {
  const { enabled, webTokenConfirmed } = dhanAutoRenewSchema.parse(req.body);
  res.json(await setDhanAutoRenew(enabled, webTokenConfirmed));
}
export async function connectConfiguredDhan(_req: Request, res: Response) {
  invariant(process.env.DHAN_ACCESS_TOKEN, 'No Dhan access token is configured');
  res.json(await saveDhanToken(process.env.DHAN_ACCESS_TOKEN));
}
export async function disconnectDhanAccount(_req: Request, res: Response) { await disconnectDhan(); res.sendStatus(204); }
