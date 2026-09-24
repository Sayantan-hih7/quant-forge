import { Router } from 'express';
import * as controller from '../controllers/qualification.controller.js';

export const qualificationRouter = Router();
qualificationRouter.get('/', controller.state);
qualificationRouter.get('/universe', controller.universe);
qualificationRouter.put('/rule', controller.saveRule);
qualificationRouter.post('/runs', controller.start);
qualificationRouter.get('/runs/:id/results', controller.results);
qualificationRouter.post('/runs/:id/cancel', controller.cancel);
qualificationRouter.post('/runs/:id/publish', controller.publish);
qualificationRouter.post('/manual', controller.addManual);
qualificationRouter.delete('/manual/:id', controller.removeManual);
qualificationRouter.delete('/manual', controller.removeAllManual);
