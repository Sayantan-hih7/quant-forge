import { Router } from 'express';
import { z } from 'zod';
import { paperOrderHistory, configurePaperSession, cancelPaperOrder, confirmPaperOrder, createPaperSession, manualPaperOrder, paperState, pauseEntries, sessionInstruments, stopPaperSession } from '../services/paper.service.js';
import { controlSchema } from '../validations/paper.validation.js';
import { previewStrategy } from '../services/preview.service.js';
import { paperChartContext } from '../services/chart-context.service.js';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
import { amendPaperOrder, exitPaperPosition } from '../services/order-controls.service.js';
export const paperRouter=Router();
paperRouter.get('/',async(_req,res)=>{res.json(await paperState());});
paperRouter.get('/instruments',async(_req,res)=>{res.json(await sessionInstruments());});
paperRouter.get('/sessions/:id/stocks/:instrumentId/chart', async(req,res)=>{
  res.json(await paperChartContext(z.string().uuid().parse(req.params.id), instrumentIdSchema.parse(req.params.instrumentId)));
});
paperRouter.post('/preview',async(req,res)=>{res.json(await previewStrategy(req.body));});
paperRouter.post('/sessions',async(req,res)=>{res.status(201).json(await createPaperSession(req.body));});
paperRouter.post('/sessions/:id/stop',async(req,res)=>{await stopPaperSession(z.string().uuid().parse(req.params.id));res.json({ok:true});});
paperRouter.patch('/sessions/:id',async(req,res)=>{await pauseEntries(z.string().uuid().parse(req.params.id),controlSchema.parse(req.body).entriesPaused);res.json({ok:true});});
paperRouter.post('/orders',async(req,res)=>{res.status(202).json(await manualPaperOrder(req.body));});
paperRouter.post('/orders/:id/confirm',async(req,res)=>{res.json(await confirmPaperOrder(z.string().uuid().parse(req.params.id)));});
paperRouter.post('/orders/:id/cancel',async(req,res)=>{await cancelPaperOrder(z.string().uuid().parse(req.params.id));res.json({ok:true});});
paperRouter.patch('/orders/:id',async(req,res)=>{res.json(await amendPaperOrder(z.string().uuid().parse(req.params.id),req.body));});
paperRouter.post('/positions/:id/exit',async(req,res)=>{res.status(202).json(await exitPaperPosition(z.string().min(1).max(150).parse(req.params.id),req.body));});

paperRouter.patch('/sessions/:id/configuration',async(req,res)=>{await configurePaperSession(z.string().uuid().parse(req.params.id),req.body);res.json({ok:true});});

paperRouter.get('/orders',async(req,res)=>{const input=z.object({sessionId:z.string().uuid().optional(),beforeAt:z.string().datetime().optional(),beforeId:z.string().optional(),filledOnly:z.enum(['true','false']).optional().transform(v=>v==='true'),exitsOnly:z.enum(['true','false']).optional().transform(v=>v==='true')}).parse(req.query);res.json(await paperOrderHistory(input));});
