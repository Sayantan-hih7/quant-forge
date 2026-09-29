import { AppError } from '../../../shared/errors.js';
import mongoose from 'mongoose';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, PaperSignalModel } from '../models/paper.model.js';

/** Read-only chart context. Scope to one session AND stock to avoid mixing
 * trades made by different strategies. Old fills remain inspectable. */
export async function paperChartContext(sessionId: string, instrumentId: string) {
  return mongoose.connection.transaction(async transaction => {
    const session = await PaperSessionModel.findById(sessionId).session(transaction).lean();
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Paper strategy session not found');
    // One snapshot prevents an exit arriving between reads from combining an old position with a new fill.
    const position = await PaperPositionModel.findOne({ sessionId, instrumentId }).session(transaction).lean();
    const fills = await PaperOrderModel.find({ sessionId, instrumentId, status: 'filled' }).sort({ filledAt: -1, _id: -1 }).limit(201).session(transaction).lean();
    const signals = await PaperSignalModel.find({ sessionId, instrumentId }).sort({ barEnd: -1, _id: -1 }).limit(101).session(transaction).lean();
    return { session, position, fills: fills.slice(0, 200), signals: signals.slice(0, 100), truncated: fills.length > 200 || signals.length > 100 };
  }, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
}
