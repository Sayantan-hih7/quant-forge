import { Router } from 'express';
import { dashboardState } from '../services/dashboard.service.js';
import { dashboardPreferences, saveDashboardPreferences } from '../services/preferences.service.js';
export const dashboardRouter = Router();
dashboardRouter.get('/', async (_req, res) => res.json(await dashboardState()));
dashboardRouter.get('/preferences', async (_req, res) => res.json(await dashboardPreferences()));
dashboardRouter.put('/preferences', async (req, res) => res.json(await saveDashboardPreferences(req.body)));
