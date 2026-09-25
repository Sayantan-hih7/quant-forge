import { z } from 'zod';
import { instruments } from '../../market-data/repository.js';
import { MonthlyUniverseModel, UniverseSnapshotModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';

const day = z.string().date();
export const universeQuerySchema = z.object({
  universe: z.enum(['current', 'historical']),
  includeManual: z.enum(['true', 'false']).transform(value => value === 'true'),
  from: day.optional(), to: day.optional(),
}).strict().refine(value => value.universe === 'current' || (!!value.from && !!value.to && value.from <= value.to), 'Choose a valid historical date range');

export async function qualifiedBacktestUniverse(input: { universe: 'current' | 'historical'; includeManual: boolean; from?: string; to?: string }) {
  const to = input.to ? new Date(Date.parse(`${input.to}T00:00:00+05:30`) + 86400000).toISOString() : undefined;
  const snapshots = input.universe === 'historical' ? await UniverseSnapshotModel.find({ month: { $gte: input.from!.slice(0, 7), $lte: input.to!.slice(0, 7) }, publishedAt: { $lt: to } }).sort({ publishedAt: 1 }).lean() : [];
  const current = input.universe === 'current' ? await MonthlyUniverseModel.findById(currentMonth()).lean() : undefined;
  const lists = current ? [current] : snapshots;
  const qualified = [...new Set(lists.flatMap(list => list.members.filter(member => input.includeManual || member.source === 'scan').map(member => member.instrumentId)))];
  return { qualified, snapshots, lists };
}

export async function backtestUniverseOptions(raw: unknown) {
  const input = universeQuerySchema.parse(raw), { qualified, lists } = await qualifiedBacktestUniverse(input);
  const stocks = await instruments.find({ _id: { $in: qualified } }).select('_id symbol exchange name').sort({ symbol: 1 }).lean();
  const scanIds = new Set(lists.flatMap(list => list.members.filter(member => member.source === 'scan').map(member => member.instrumentId)));
  return { stocks: stocks.map(stock => ({ ...stock, source: scanIds.has(stock._id) ? 'scan' : 'manual' })), listCount: lists.length,
    publishedAt: lists[0]?.publishedAt ?? null, month: input.universe === 'current' ? currentMonth() : null };
}
