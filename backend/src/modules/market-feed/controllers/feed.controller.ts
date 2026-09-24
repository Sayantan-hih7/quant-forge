import type { Request, Response } from 'express';
import { feedStatus, connectFeed, disconnectFeed, submitFeedOtp } from '../services/feed.service.js';
import { feedConnectSchema, feedOtpSchema } from '../validations/feed.validation.js';

export async function status(_req: Request, res: Response) { res.json(await feedStatus()); }
export async function connect(req: Request, res: Response) { res.status(202).json(await connectFeed(feedConnectSchema.parse(req.body).ids)); }
export async function disconnect(_req: Request, res: Response) { await disconnectFeed(); res.sendStatus(204); }
export async function otp(req: Request, res: Response) { await submitFeedOtp(feedOtpSchema.parse(req.body).otp); res.sendStatus(202); }
