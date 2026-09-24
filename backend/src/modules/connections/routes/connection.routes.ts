import { Router } from 'express';
import { beginDhan, completeDhan, connectDhanToken, connectConfiguredDhan, disconnectDhanAccount, updateDhanAutoRenew } from '../controllers/connection.controller.js';

export const connectionRouter = Router();
connectionRouter.post('/dhan/login', beginDhan);
connectionRouter.post('/dhan/complete', completeDhan);
connectionRouter.post('/dhan/token', connectDhanToken);
connectionRouter.post('/dhan/configured-token', connectConfiguredDhan);
connectionRouter.patch('/dhan/auto-renew', updateDhanAutoRenew);
connectionRouter.delete('/dhan', disconnectDhanAccount);
