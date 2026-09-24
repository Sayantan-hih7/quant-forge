import { Router } from 'express';
import * as controller from '../controllers/feed.controller.js';
export const feedRouter = Router();
feedRouter.get('/', controller.status);
feedRouter.post('/connect', controller.connect);
feedRouter.post('/otp', controller.otp);
feedRouter.delete('/', controller.disconnect);
