import { Router } from 'express';
import { z } from 'zod';
import { BacktestRunModel } from '../models/backtest.model.js';
import { queueBacktest } from '../services/backtest.service.js';
export const backtestRouter = Router();
backtestRouter.get('/', async (_req,res) => { res.json(await BacktestRunModel.find().select('-snapshots -result').sort({createdAt:-1}).limit(30).lean()); });
backtestRouter.get('/:id', async (req,res) => { res.json(await BacktestRunModel.findById(z.string().uuid().parse(req.params.id)).select('-snapshots').lean()); });
backtestRouter.post('/',async(req,res)=>{res.status(202).json(await queueBacktest(req.body));});
