import { Router } from 'express';
import { status, startImport, search, detail, capabilities } from '../controllers/market-data.controller.js';
export const marketDataRouter = Router();
marketDataRouter.get('/status', status);
marketDataRouter.get('/capabilities', capabilities);
marketDataRouter.post('/imports', startImport);
marketDataRouter.get('/instruments', search);
marketDataRouter.get('/instruments/:id', detail);
