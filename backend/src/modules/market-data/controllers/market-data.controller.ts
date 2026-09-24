import type { Request, Response } from 'express';
import { z } from 'zod';
import { dataStatus, queueImport, searchInstruments, instrumentDetail } from '../services/market-data.service.js';
import { importSchema, instrumentIdSchema } from '../validations/market-data.validation.js';
import { ruleCapabilities } from '../services/capabilities.service.js';
export async function capabilities(_req: Request, res: Response) { res.json(await ruleCapabilities()); }
export async function status(_req: Request, res: Response) { res.json(await dataStatus()); }
export async function startImport(req: Request, res: Response) { res.status(202).json(await queueImport(importSchema.parse(req.body))); }
export async function search(req: Request, res: Response) {
  const input = z.object({ q: z.string().max(100).default(''), exchange: z.enum(['NSE', 'BSE']).optional() }).parse(req.query);
  res.json(await searchInstruments(input.q, input.exchange));
}
export async function detail(req: Request, res: Response) { res.json(await instrumentDetail(instrumentIdSchema.parse(req.params.id))); }
