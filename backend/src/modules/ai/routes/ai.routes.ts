import {conversationRouter} from '../services/conversations.js';
import { Router } from 'express';
import * as controller from '../controllers/ai.controller.js';
export const aiRouter = Router();
aiRouter.get('/status', controller.status);
aiRouter.post('/proposals', controller.propose);

aiRouter.post('/chat', controller.chat);

aiRouter.use('/conversations',conversationRouter);
