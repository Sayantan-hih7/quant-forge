import { Router } from 'express';
import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
import { stockDetail } from '../services/details.service.js';
import { stockHistory } from '../services/history.service.js';
import { selectedInstruments, stockQuotes } from '../services/quotes.service.js';
import { stockQuoteStream } from '../services/stream.service.js';

export const stockDetailsRouter = Router();
const selection = z.object({ ids: z.string().max(2000).transform(s => s.split(',')).pipe(z.array(instrumentIdSchema).min(1).max(100)) });
stockDetailsRouter.get('/quotes', async (req, res) => {
  const { ids } = selection.parse(req.query); res.json(await stockQuotes(await selectedInstruments(ids)));
});
stockDetailsRouter.get('/stream', async (req, res) => {
  const candles = z.enum(['true', 'false']).optional().parse(req.query.candles) === 'true';
  const { ids } = selection.parse(req.query), stocks = await selectedInstruments(ids);
  if (res.destroyed) return;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write(': stock prices\n\n');
  const unsubscribe = stockQuoteStream.watch(stocks, event => {
    if (res.destroyed) return;
    if (res.writableLength > 262144) { res.destroy(); return; }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }, () => res.end(), candles);
  const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15_000);
  res.once('close', () => { clearInterval(heartbeat); unsubscribe(); });
});
stockDetailsRouter.get('/:id/chart', async (req, res) => {
  const id = instrumentIdSchema.parse(req.params.id);
  const timeframe = z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo']).default('1d').parse(req.query.timeframe);
  const at = z.string().datetime().refine(s => Date.parse(s) >= Date.UTC(2000,0) && Date.parse(s) <= Date.now() + 2 * 86400000, 'Choose a historical chart date').optional().parse(req.query.at);
  const [stock] = await selectedInstruments([id], false); res.json(await stockHistory(stock, timeframe, undefined, { at }));
});
stockDetailsRouter.get('/:id', async (req, res) => { res.json(await stockDetail(instrumentIdSchema.parse(req.params.id))); });
