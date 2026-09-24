import { Router } from 'express';
import { chart, quotes } from '../controllers/index.controller.js';
export const indexRouter = Router();
indexRouter.get('/', quotes);
indexRouter.get('/chart', chart);
