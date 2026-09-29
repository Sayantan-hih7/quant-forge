import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { instruments, storedCandles, facts } from '../src/modules/market-data/repository.js';
import { MonthlyRuleModel, MonthlyUniverseModel, QualificationRunModel } from '../src/modules/qualification/models/qualification.model.js';
import { PaperSessionModel, PaperPositionModel, PaperOrderModel } from '../src/modules/paper-trading/models/paper.model.js';
import { StrategyModel } from '../src/modules/strategies/models/strategy.model.js';
import { BacktestRunModel } from '../src/modules/backtesting/models/backtest.model.js';

// Read-only, reproducible audit. The optional backup excludes broker credentials.
const now = new Date().toISOString();
const month = new Date(Date.now() + 19_800_000).toISOString().slice(0, 7);
await connectDatabase();
try {
  const [rule, universe, sessions, positions, orders, strategies, runs, candles, coverage, invalidCandles, futureCandles, indexes] = await Promise.all([
    MonthlyRuleModel.findById('monthly').lean(), MonthlyUniverseModel.findById(month).lean(),
    PaperSessionModel.find().lean(), PaperPositionModel.find().lean(), PaperOrderModel.find().lean(),
    StrategyModel.find().lean(), QualificationRunModel.find({ month }).sort({ cutoff: -1 }).limit(10).lean(),
    storedCandles.aggregate([{ $group: { _id: '$interval', rows: { $sum: 1 }, from: { $min: '$time' }, to: { $max: '$time' }, stocks: { $addToSet: '$instrumentId' } } }, { $project: { rows: 1, from: 1, to: 1, stocks: { $size: '$stocks' } } }]),
    facts.aggregate([{ $group: { _id: { field: '$field', source: '$source' }, rows: { $sum: 1 }, latest: { $max: '$knownAt' }, stocks: { $addToSet: '$instrumentId' } } }, { $project: { rows: 1, latest: 1, stocks: { $size: '$stocks' } } }]),
    storedCandles.countDocuments({ $or: [{ open: { $lte: 0 } }, { low: { $lte: 0 } }, { volume: { $lt: 0 } }, { $expr: { $or: [{ $gt: ['$low', '$high'] }, { $lt: ['$high', '$open'] }, { $lt: ['$high', '$close'] }, { $gt: ['$low', '$open'] }, { $gt: ['$low', '$close'] }] } }] }),
    storedCandles.countDocuments({ time: { $gt: now } }), storedCandles.collection.indexes(),
  ]);
  const ids = universe?.members.map(m => m.instrumentId) ?? [];
  const active = await instruments.find({ _id: { $in: ids }, active: true }).select('_id').lean();
  const report = { checkedAt: now, published: { month, stocks: ids.length, inactiveOrMissing: ids.filter(id => !active.some(s => s._id === id)), savedRulesDiffer: rule?.fingerprint !== universe?.fingerprint },
    candles, invalidCandles, futureCandles, candleUniqueKeys: indexes.filter(i => i.unique).map(i => i.key), factCoverage: coverage,
    sessions: sessions.map(s => ({ id: s._id, name: s.strategy.name, active: s.active, mode: s.mode, selected: s.ids?.length, eligible: s.ids?.filter(id => ids.includes(id)).length, revision: s.strategy.revision, savedRevision: strategies.find(t => t._id === s.strategyId)?.revision })),
    positions: positions.length, orderStates: orders.reduce<Record<string, number>>((a, o) => ({ ...a, [o.status]: (a[o.status] ?? 0) + 1 }), {}),
    latestScan: runs[0] && { id: runs[0]._id, status: runs[0].status, revision: runs[0].revision, cutoff: runs[0].cutoff } };
  const output = resolve(process.env.AUDIT_OUTPUT ?? '../.tools/paper-workspace-audit.json');
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  if (process.env.BACKUP_OUTPUT) {
    const target = resolve(process.env.BACKUP_OUTPUT);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, JSON.stringify({ savedAt: now, rule, universe, sessions, positions, orders, strategies, runs,
      backtests: await BacktestRunModel.find().select('-result -snapshots').lean() }, null, 2), { flag: 'wx' });
  }
  console.log(JSON.stringify({ output, ...report }, null, 2));
} finally { await disconnectDatabase(); }
