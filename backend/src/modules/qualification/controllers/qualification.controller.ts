import type { Request, Response } from 'express';
import * as service from '../services/qualification.service.js';
import { addManualStock, removeManualStocks, qualifiedStocks } from '../services/universe.service.js';
import { saveMonthlyRuleSchema, runIdSchema, resultQuerySchema, publishSchema, manualStockSchema } from '../validations/qualification.validation.js';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';

export async function state(_req: Request, res: Response) { res.json(await service.qualificationState()); }
export async function universe(_req: Request, res: Response) { res.json(await qualifiedStocks()); }
export async function saveRule(req: Request, res: Response) {
  const { rule, expectedRevision } = saveMonthlyRuleSchema.parse(req.body);
  res.json(await service.saveMonthlyRule(rule, expectedRevision));
}
export async function start(_req: Request, res: Response) { res.status(202).json(await service.startQualification()); }
export async function results(req: Request, res: Response) {
  const { status, page } = resultQuerySchema.parse(req.query);
  res.json(await service.qualificationResults(runIdSchema.parse(req.params.id), page, status));
}
export async function cancel(req: Request, res: Response) { await service.cancelQualification(runIdSchema.parse(req.params.id)); res.sendStatus(204); }
export async function publish(req: Request, res: Response) {
  const { acknowledgeMissingData } = publishSchema.parse(req.body);
  res.json(await service.publishQualification(runIdSchema.parse(req.params.id), acknowledgeMissingData));
}
export async function addManual(req: Request, res: Response) {
  const { instrumentId, note } = manualStockSchema.parse(req.body);
  await addManualStock(instrumentId, note); res.sendStatus(204);
}
export async function removeManual(req: Request, res: Response) {
  await removeManualStocks(instrumentIdSchema.parse(req.params.id)); res.sendStatus(204);
}
export async function removeAllManual(_req: Request, res: Response) { await removeManualStocks(); res.sendStatus(204); }
