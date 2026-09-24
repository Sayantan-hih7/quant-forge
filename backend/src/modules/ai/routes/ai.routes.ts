import { Router } from 'express';
import * as controller from '../controllers/ai.controller.js';
export const aiRouter = Router();
aiRouter.get('/status', controller.status);
aiRouter.post('/proposals', controller.propose);
