import { Router } from 'express';
import { discoveryCatalog, discoverStocks } from '../services/discovery.service.js';
export const discoveryRouter = Router();
discoveryRouter.get('/', async (req, res) => res.json(await discoveryCatalog(req.query)));
discoveryRouter.get('/stocks', async (req, res) => res.json(await discoverStocks(req.query)));
