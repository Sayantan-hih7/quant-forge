import { Router } from 'express';
import { z } from 'zod';
import { StrategyModel } from '../models/strategy.model.js';
import { saveStrategy } from '../services/strategy.service.js';
import { saveStrategySchema, strategySchema } from '../validations/strategy.validation.js';
import { researchPresets } from '../config/research-presets.js';
import { invariant } from '../../../shared/errors.js';
export const strategyRouter = Router();
strategyRouter.get('/', async (_req, res) => { res.json(await StrategyModel.find().sort({ savedAt: -1 }).lean()); });
strategyRouter.get('/examples', (_req, res) => { res.json(researchPresets); });
strategyRouter.post('/examples/:key', async (req, res) => {
  const preset = researchPresets.find(p => p.key === req.params.key); invariant(preset, 'Unknown research example');
  const existing = await StrategyModel.findById(preset.id).lean();
  res.json(existing ?? await saveStrategy(preset.id, strategySchema.parse(preset.draft), 0));
});
strategyRouter.put('/:id', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id), body = saveStrategySchema.parse(req.body);
  res.json(await saveStrategy(id, body.draft, body.expectedRevision));
});
