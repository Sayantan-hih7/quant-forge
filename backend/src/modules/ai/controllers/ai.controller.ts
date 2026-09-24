import type { Request, Response } from 'express';
import { aiRequestSchema } from '../validations/ai.validation.js';
import { assistantStatus, proposeRules } from '../services/assistant.service.js';

export function status(_req: Request, res: Response) { res.json(assistantStatus()); }
export async function propose(req: Request, res: Response) {
  const request = aiRequestSchema.parse(req.body);
  const controller = new AbortController();
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', onClose);
  try { const result = await proposeRules(request, controller.signal); if (!res.destroyed) res.json(result); }
  catch (error) { if (!controller.signal.aborted) throw error; }
  finally { res.off('close', onClose); }
}
