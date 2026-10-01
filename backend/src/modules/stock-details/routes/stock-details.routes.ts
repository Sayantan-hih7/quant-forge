import { Router } from 'express';
import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
import { stockDetail } from '../services/details.service.js';
import { stockListings } from '../services/listings.service.js';
import { stockHistory } from '../services/history.service.js';
import { selectedInstruments, stockQuotes } from '../services/quotes.service.js';
import { stockQuoteStream } from '../services/stream.service.js';
import { benchmarkHistory } from '../services/benchmark-history.service.js';
import { stockResearchFeed } from '../services/research-feeds.service.js';
import { stockFinancials } from '../services/financials.service.js';
import { stockDepth } from '../services/depth.service.js';
import { relatedStocks } from '../services/related-stocks.service.js';

export const stockDetailsRouter = Router();
stockDetailsRouter.get('/benchmarks/:name/chart',async(req,res)=>{
  const name=z.enum(['NIFTY 50','NIFTY BANK','SENSEX']).parse(req.params.name);
  const timeframe=z.enum(['1d','1w','1mo']).default('1d').parse(req.query.timeframe);
  const at=z.string().datetime().refine(v=>Date.parse(v)<=Date.now()+86400000&&Date.parse(v)>=Date.UTC(2000,0)).optional().parse(req.query.at);
  const from=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&Date.parse(v)>=Date.UTC(1990,0)&&Date.parse(v)<(at?Date.parse(at):Date.now())).parse(req.query.from);
  res.json(await benchmarkHistory(name,timeframe,from,at));
});
const selection = z.object({ ids: z.string().max(2000).transform(s => s.split(',')).pipe(z.array(instrumentIdSchema).min(1).max(100)) });
stockDetailsRouter.get('/quotes', async (req, res) => {
  const { ids } = selection.parse(req.query), stocks = await selectedInstruments(ids, true, true);
  const unavailableIds = ids.filter(id => !stocks.some(s => s._id === id));
  res.json({ ...await stockQuotes(stocks), ...(unavailableIds.length ? { unavailableIds } : {}) });
});
stockDetailsRouter.get('/stream', async (req, res) => {
  const candles = z.enum(['true', 'false']).optional().parse(req.query.candles) === 'true';
  const { ids } = selection.parse(req.query), stocks = await selectedInstruments(ids, true, true);
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
  const minBars = z.coerce.number().int().min(1).max(1500).optional().parse(req.query.minBars);
  const lookbackDays = z.coerce.number().int().min(7).max(2196).optional().parse(req.query.lookbackDays);
  const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s && s >= '1990-01-01' && s <= new Date(Date.now() + 19_800_000).toISOString().slice(0, 10), 'Choose a valid past anchor date').optional().parse(req.query.from);
  const [stock] = await selectedInstruments([id], false); res.json(await stockHistory(stock, timeframe, undefined, { at, minBars, from, lookbackDays }));
});
stockDetailsRouter.get('/:id/listings', async (req, res) => { res.json(await stockListings(instrumentIdSchema.parse(req.params.id))); });
stockDetailsRouter.get('/:id/related', async (req, res) => { res.json(await relatedStocks(instrumentIdSchema.parse(req.params.id))); });
stockDetailsRouter.get('/:id/financials', async (req, res) => { res.json(await stockFinancials(instrumentIdSchema.parse(req.params.id))); });
stockDetailsRouter.get('/:id/depth',async(req,res)=>{const [stock]=await selectedInstruments([instrumentIdSchema.parse(req.params.id)],false);res.json(await stockDepth(stock));});
stockDetailsRouter.get('/:id/news',async(req,res)=>{res.json(await stockResearchFeed(instrumentIdSchema.parse(req.params.id),'news'));});
stockDetailsRouter.get('/:id/events',async(req,res)=>{const scope=z.enum(['stock','market']).default('stock').parse(req.query.scope);res.json(await stockResearchFeed(instrumentIdSchema.parse(req.params.id),'events',scope));});
stockDetailsRouter.get('/:id', async (req, res) => { res.json(await stockDetail(instrumentIdSchema.parse(req.params.id))); });
