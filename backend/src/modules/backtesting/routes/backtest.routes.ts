import {assessPaperEligibility,eligibilitySettingsSchema} from '../services/paper-eligibility.js';
import { Router } from 'express';
import { z } from 'zod';
import { BacktestRunModel } from '../models/backtest.model.js';
import { queueBacktest } from '../services/backtest.service.js';
import { backtestUniverseOptions } from '../services/universe.service.js';
import { backtestStockChart } from '../services/chart.service.js';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
import { backtestReplay } from '../services/replay.service.js';
export const backtestRouter = Router();
backtestRouter.get('/', async (req,res) => { const strategyId = z.string().uuid().optional().parse(req.query.strategyId); res.json(await BacktestRunModel.find(strategyId ? { 'strategy._id': strategyId } : {}).select('-snapshots -result').sort({createdAt:-1}).limit(30).lean()); });
backtestRouter.get('/universe', async (req, res) => { res.json(await backtestUniverseOptions(req.query)); });
backtestRouter.get('/:id/stocks/:instrumentId/replay', async (req, res) => {
  res.json(await backtestReplay(z.string().uuid().parse(req.params.id), instrumentIdSchema.parse(req.params.instrumentId)));
});
backtestRouter.get('/:id/stocks/:instrumentId/chart', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id), instrumentId = instrumentIdSchema.parse(req.params.instrumentId);
  const frame = z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo']).default('1d').parse(req.query.timeframe);
  res.json(await backtestStockChart(id, instrumentId, frame));
});
backtestRouter.post('/:id/paper-eligibility',async(req,res)=>{res.json(await assessPaperEligibility(z.string().uuid().parse(req.params.id),req.body));});
backtestRouter.put('/:id/paper-eligibility',async(req,res)=>{const id=z.string().uuid().parse(req.params.id),settings=eligibilitySettingsSchema.parse(req.body);const preview=await assessPaperEligibility(id,settings);await BacktestRunModel.updateOne({_id:id},{$set:{paperEligibilitySettings:settings}});res.json(preview);});
backtestRouter.get('/:id', async (req,res) => { res.json(await BacktestRunModel.findById(z.string().uuid().parse(req.params.id)).select('-snapshots -result.replay').lean()); });
backtestRouter.post('/',async(req,res)=>{res.status(202).json(await queueBacktest(req.body));});
