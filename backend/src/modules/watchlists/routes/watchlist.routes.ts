import { Router } from 'express';
import { watchlistStock } from '../validations/watchlist.validation.js';
import { addWatchlistStock, browseStocks, listWatchlists, removeWatchlistStock } from '../services/watchlist.service.js';
export const watchlistRouter = Router();
watchlistRouter.get('/', async (_req, res) => res.json(await listWatchlists()));
watchlistRouter.get('/stocks', async (req, res) => res.json(await browseStocks(req.query)));
watchlistRouter.post('/:id/stocks', async (req, res) => res.json(await addWatchlistStock(req.params.id, watchlistStock.parse(req.body).instrumentId)));
watchlistRouter.delete('/:id/stocks/:instrumentId', async (req, res) => res.json(await removeWatchlistStock(req.params.id, req.params.instrumentId)));
