import { InstrumentModel } from '../../market-data/models/market-data.model.js';
import { MonthlyUniverseModel, QualificationRunModel } from '../../qualification/models/qualification.model.js';
import { StrategyModel } from '../../strategies/models/strategy.model.js';
import { BacktestRunModel } from '../../backtesting/models/backtest.model.js';
import { PaperSignalModel } from '../../paper-trading/models/paper.model.js';
import { paperState } from '../../paper-trading/services/paper.service.js';
import { personalWatchlist } from '../../watchlists/services/watchlist.service.js';
import { marketSession } from '../../../shared/market-calendar.js';
import { dashboardPreferences } from './preferences.service.js';

export async function dashboardState() {
  const { settings: preferences } = await dashboardPreferences();
  const market = marketSession(), month = market.date.slice(0, 7), start = new Date(`${market.date}T00:00:00+05:30`).toISOString();
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  const [paper, universe, stockCount, strategies, latestScan, backtests, watchlist, signalsToday, recentSignals] = await Promise.all([
    paperState(), MonthlyUniverseModel.findById(month).lean(), InstrumentModel.countDocuments({ active: true }),
    StrategyModel.find().select('_id name revision savedAt').sort({ savedAt: -1 }).lean(),
    QualificationRunModel.findOne({ month }).select('_id status processed total qualified unavailable cutoff finishedAt message').sort({ cutoff: -1 }).lean(),
    BacktestRunModel.find().select('_id strategy._id strategy.name strategy.revision status config.from config.to createdAt').sort({ createdAt: -1, _id: -1 }).limit(preferences.backtestCount).lean(),
    personalWatchlist(),
    PaperSignalModel.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    PaperSignalModel.find(preferences.signalSide === 'all' ? {} : { side: preferences.signalSide }).sort({ createdAt: -1, _id: -1 }).limit(preferences.signalCount).lean(),
  ]);
  const accounts = paper.sessions.filter(s => s.mode !== 'signals' || s.hasTrades);
  const realizedPaise = accounts.reduce((sum, s) => sum + s.bookedPnlPaise, 0);
  const missingMarks = paper.positions.filter(p => !p.mark).length, staleMarks = paper.positions.filter(p => p.mark && !p.mark.fresh).length;
  const unrealizedPaise = missingMarks ? null : paper.positions.reduce((sum, p) => sum + (p.mark?.unrealizedPaise ?? 0), 0);
  const revisions = new Map(strategies.map(s => [s._id, s.revision]));
  const sessions = paper.sessions.filter(s => s.active).map(s => ({ id: s._id, name: s.strategy.name, revision: s.strategy.revision,
    currentRevision: revisions.get(s.strategyId) ?? null, mode: s.mode, paused: s.entriesPaused, stocks: s.scope.selectedIds.length,
    checkedAt: s.checkedAt ?? null, message: s.message ?? null }));
  const signalStocks = await InstrumentModel.find({ _id: { $in: recentSignals.map(s => s.instrumentId) } }).select('_id symbol').lean();
  const symbols = new Map(signalStocks.map(s => [s._id, s.symbol]));
  return { at: new Date().toISOString(), market, month, preferences, stockCount, strategyCount: strategies.length, signalsToday,
    qualification: { count: universe?.members.length ?? 0, manualCount: universe?.members.filter(m => m.source === 'manual').length ?? 0, publishedAt: universe?.publishedAt ?? null, latestScan },
    paper: { accounts: accounts.length, openPositions: paper.positions.length, realizedPaise, unrealizedPaise,
      totalPaise: unrealizedPaise === null ? null : realizedPaise + unrealizedPaise, staleMarks, missingMarks,
      pendingOrders: paper.orders.filter(o => o.status === 'pending').length, confirmations: paper.orders.filter(o => o.status === 'confirmation').length,
      workerRunning: paper.workerRunning, feed: paper.feed.state, feedMessage: paper.feed.message, sessions },
    signals: recentSignals.map(s => ({ id: s._id, sessionId: s.sessionId, symbol: symbols.get(s.instrumentId) ?? s.instrumentId,
      side: s.side, at: s.createdAt ?? s.barEnd, strategy: paper.sessions.find(x => x._id === s.sessionId)?.strategy.name ?? 'Earlier strategy',
      status: s.orderId ? paper.orders.find(o => o._id === s.orderId)?.status ?? 'Order recorded' : s.expiresAt && s.expiresAt <= new Date().toISOString() ? 'expired' : 'Signal only' })),
    backtests: backtests.map(b => ({ id: b._id, strategyId: b.strategy._id, name: b.strategy.name, revision: b.strategy.revision,
      currentRevision: revisions.get(b.strategy._id) ?? null, status: b.status, from: b.config.from, to: b.config.to })),
    watchlists: [{ id: watchlist._id, name: 'Watchlist', count: watchlist.ids.length }],
  };
}
