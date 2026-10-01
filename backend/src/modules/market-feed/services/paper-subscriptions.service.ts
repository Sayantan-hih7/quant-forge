import { randomUUID } from 'node:crypto';
import { FeedSettingsModel, type FeedAutomation } from '../models/feed-settings.model.js';
import { PaperSessionModel, PaperPositionModel, PaperOrderModel, PaperTriggerModel } from '../../paper-trading/models/paper.model.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { instruments } from '../../market-data/repository.js';
import { ConnectionModel } from '../../connections/models/connection.model.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { motilalConfigured } from './recovery.js';
import type { FeedRequest } from './feed.service.js';
import { subscriptionPlan, WORKSPACE_FEED_CAPACITY } from './subscription-plan.js';

/** Feed worker owns recurring reconciliation. This only saves intent, never places orders. */
export async function syncPaperSubscriptions() {
  const [settings, sessions, universe] = await Promise.all([
    FeedSettingsModel.findById('primary').lean(), PaperSessionModel.find({ active: true }).select('_id ids').lean(),
    MonthlyUniverseModel.findById(marketTime().date.slice(0, 7)).select('members.instrumentId').lean(),
  ]);
  const [held, pending, conditions] = await Promise.all([
    PaperPositionModel.distinct('instrumentId', { sessionId: { $in: sessions.map(s => s._id) } }),
    PaperOrderModel.distinct('instrumentId', { sessionId: { $in: sessions.map(s => s._id) }, status: { $in: ['pending', 'confirmation'] }, expiresAt: { $gt: new Date().toISOString() } }),
    // Manual conditional orders need live candles for their stock.
    PaperTriggerModel.distinct('instrumentId', { sessionId: { $in: sessions.map(s => s._id) }, status: 'active' }),
  ]);
  const qualified = new Set(universe?.members.map(m => m.instrumentId) ?? []);
  // Pausing automatic entries does not disable manual buys or exits for held shares.
  const eligible = sessions.flatMap(s => (s.ids ?? [...qualified]).filter(id => qualified.has(id)));
  const paperIds = [...new Set([...held.sort(), ...pending.sort(), ...conditions.sort(), ...eligible.sort()])];
  const manualRequest = settings?.paperManaged ? settings.manualRequest : settings?.request;
  const manualEnabled = settings?.paperManaged ? !!settings.manualEnabled : !!settings?.enabled;
  const paused = !!settings?.automationPaused;
  const wanted = [...new Set([...paperIds, ...(manualEnabled ? manualRequest?.instruments.map(s => s.id) ?? [] : [])])];
  const stocks = await instruments.find({ _id: { $in: wanted }, active: true }).select('_id symbol exchange securityId motilalCode').lean();
  const lookup = new Map(stocks.map(s => [s._id, s]));
  // Held and pending positions have first claim on the bounded connection capacity.
  const provider = manualRequest?.provider ?? settings?.request?.provider ?? 'auto';
  const candidates = wanted.filter(id => lookup.has(id)).map(id => { const s = lookup.get(id)!; return { id, symbol: s.symbol, exchange: s.exchange, securityId: s.securityId, ...(s.motilalCode == null ? {} : { code: s.motilalCode }) }; });
  const dhan = await ConnectionModel.findById('dhan').lean();
  const canDhan = !!process.env.DHAN_CLIENT_ID && dhan?.status === 'connected' && Date.parse(dhan.expiresAt ?? '') > Date.now();
  const canMotilal = motilalConfigured();
  const plan = subscriptionPlan(candidates, { preference: provider, motilal: canMotilal, dhan: canDhan });
  const available = new Set([...plan.motilal, ...plan.dhan].map(s => s.id));
  const feedInstruments = candidates.filter(s => available.has(s.id));
  const selected = feedInstruments.map(s => s.id);
  const unavailableIds = wanted.filter(id => !available.has(id));
  const credentialsReady = provider === 'dhan' ? canDhan : provider === 'motilal' ? canMotilal : canDhan || canMotilal;
  const enabled = !paused && !!selected.length && !!credentialsReady;
  // Mongo may reorder object keys or store an absent optional code as null.
  // Priority can reorder the same stocks when an order/holding appears. That
  // must not reconnect a healthy socket; only a changed subscription set does.
  const signature = (rows: FeedRequest['instruments']) => JSON.stringify(rows.map(s => [s.id, s.symbol, s.exchange, s.securityId, s.code ?? null] as const).sort((a, b) => a[0].localeCompare(b[0])));
  const sameRequest = settings?.request?.provider === provider && signature(settings.request.instruments) === signature(feedInstruments);
  const request: FeedRequest | undefined = selected.length ? { id: sameRequest ? settings!.request!.id : randomUUID(), provider, instruments: feedInstruments } : settings?.request;
  const automation: FeedAutomation = {
    state: paused ? 'paused' : !wanted.length ? 'idle' : !credentialsReady || !selected.length || unavailableIds.length ? 'blocked' : 'scheduled',
    message: paused ? 'Execution feed was paused in connection settings. Starting or resuming paper monitoring enables it again.'
      : !wanted.length ? 'Live data will connect automatically when paper monitoring starts.'
      : !credentialsReady ? 'Broker authentication is unavailable. Update the connection credentials; automatic connection will retry.'
      : unavailableIds.length ? `${unavailableIds.length} stocks need a provider mapping or available capacity (Motilal up to 200; Dhan overflow, ${WORKSPACE_FEED_CAPACITY.toLocaleString()} total). Held positions have priority.`
      : 'Execution subscriptions are managed automatically for active paper sessions and held positions.',
    paperIds, unavailableIds,
  };
  const next = { enabled, request, manualRequest, manualEnabled, paperManaged: true, automationPaused: paused, automation };
  if (settings && Object.entries(next).every(([key, value]) => JSON.stringify(settings[key as keyof typeof settings]) === JSON.stringify(value))) return;
  // Manual disconnect/settings changes win over a reconciliation that started earlier.
  try {
    await FeedSettingsModel.updateOne({ _id: 'primary', revision: settings?.revision ?? { $exists: false } }, { $set: next, $inc: { revision: 1 } }, { upsert: !settings });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
  }
}

/** A successful session action is retained even if coordination needs a later retry. */
export async function updatePaperSubscriptions(resume = false) {
  try {
    if (resume) await FeedSettingsModel.updateOne({ _id: 'primary' }, { $set: { automationPaused: false }, $inc: { revision: 1 } }, { upsert: true });
    await syncPaperSubscriptions();
  } catch { /* The feed worker retries from durable active sessions. */ }
}
