import type { Request, Response } from 'express';
import { z } from 'zod';
import { indexChart, indexQuotes } from '../services/index.service.js';
export async function quotes(_req: Request, res: Response) { res.set('Cache-Control','no-store').json(await indexQuotes()); }
export async function chart(req: Request, res: Response) {
  const id = z.string().max(140).regex(/^(nse|bse):[a-z0-9-]+$/).parse(req.query.id);
  res.set('Cache-Control','no-store').json(await indexChart(id));
}
