import { ConnectionModel } from '../../connections/models/connection.model.js';
import { AppError } from '../../../shared/errors.js';
import { qualifiedResearchStatus, queueQualifiedResearchRefresh } from '../services/research-refresh.service.js';
import { Router } from 'express';
import * as controller from '../controllers/qualification.controller.js';
import { reviewMonthlyRule } from '../services/monthly-review.service.js';

export const qualificationRouter = Router();
qualificationRouter.get('/', controller.state);
qualificationRouter.get('/research-status', async (_req,res) => {res.json(await qualifiedResearchStatus());});
qualificationRouter.post('/research-refresh', async (_req,res) => {
 const connection=await ConnectionModel.findById('dhan').select('status expiresAt').lean();
 if(connection?.status!=='connected'||!(Date.parse(connection.expiresAt??'')>Date.now()))throw new AppError(424,'DHAN_REQUIRED','Reconnect Dhan in Connections & Data before retrying the download.');
 const queued=await queueQualifiedResearchRefresh(Date.now(),true);
 if(!queued)throw new AppError(422,'NO_QUALIFIED_STOCKS','Publish a qualified stock list before refreshing suitability data.');
 res.status(202).json({status:'queued'});
});
qualificationRouter.get('/universe', controller.universe);
qualificationRouter.get('/membership', controller.membership);
qualificationRouter.put('/rule', controller.saveRule);
qualificationRouter.post('/rule/review', (req,res) => { res.json(reviewMonthlyRule(req.body)); });
qualificationRouter.post('/runs', controller.start);
qualificationRouter.get('/runs/:id/results', controller.results);
qualificationRouter.post('/runs/:id/cancel', controller.cancel);
qualificationRouter.post('/runs/:id/publish', controller.publish);
qualificationRouter.post('/manual', controller.addManual);
qualificationRouter.delete('/manual/:id', controller.removeManual);
qualificationRouter.delete('/manual', controller.removeAllManual);
