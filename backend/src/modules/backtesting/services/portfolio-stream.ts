import { Readable } from 'node:stream';
import { engineClient, engineInstruments } from '../../engine/services/engine.service.js';
import { invariant } from '../../../shared/errors.js';
import type { BacktestRun } from '../models/backtest.model.js';
import type { HistoryPlan } from './history-plan.js';
import { intradayHistoryQuality, emptyQuality, type QualityCounts, type IntradayHistoryQuality } from './history-quality.js';

type Instrument = Awaited<ReturnType<typeof engineInstruments>>[number];
type Candle = Instrument['daily'][number];
export const BACKTEST_STREAM_BYTES = 1_024 * 1_024 * 1_024;
export const BACKTEST_MAX_CANDLES = 8_000_000;
const compact = (rows: Candle[]) => rows.map(row => [row.time, row.open, row.high, row.low, row.close, row.volume]);

/** Transfer one stock at a time; calculation still uses one shared portfolio.
 * Compact OHLCV tuples avoid repeating field names and instrument IDs per minute.
 * Backpressure bounds the producer; an end record detects truncated uploads. */
export async function* backtestStream(run: Pick<BacktestRun, 'strategy' | 'config' | 'snapshots'>, load: (id: string) => Promise<Instrument>,
  observe: (stock: Instrument) => void = () => {}, replayInstrumentId?: string) {
  invariant(run.config.ids.length > 0 && run.config.ids.length <= 200 && new Set(run.config.ids).size === run.config.ids.length, 'Select 1-200 distinct stocks');
  let bytes = 0, candles = 0;
  const line = (value: unknown) => {
    const encoded = Buffer.from(JSON.stringify(value) + '\n'); bytes += encoded.length;
    invariant(bytes <= BACKTEST_STREAM_BYTES && encoded.length <= 64 * 1024 * 1024, 'Backtest history exceeds the safe transfer size. Shorten the date range or indicator warm-up.');
    return encoded;
  };
  yield line({ format: 'quantforge-backtest-v1', readinessVersion: !replayInstrumentId && run.config.dataPolicy ? 1 : undefined, strategy: run.strategy, config: replayInstrumentId ? {...run.config,dataPolicy:undefined} : run.config, snapshots: run.snapshots, replayInstrumentId });
  for (const id of run.config.ids) {
    const stock = await load(id);
    invariant(stock.id === id, 'Backtest history does not match the requested stock');
    candles += stock.daily.length + stock.intraday.length;
    invariant(candles <= BACKTEST_MAX_CANDLES, 'This backtest exceeds 8 million candles including indicator warm-up. Shorten the date range or warm-up.');
    observe(stock);
    yield line({ ...stock, daily: compact(stock.daily), intraday: compact(stock.intraday), candleEncoding: 'ohlcv-v1' });
  }
  yield line({ end: true, instruments: run.config.ids.length, candles });
}

export async function portfolioBacktest(run: Pick<BacktestRun, 'strategy' | 'config' | 'snapshots'>, plan: HistoryPlan, replayInstrumentId?: string) {
  const qualities=new Map<string,IntradayHistoryQuality>();
  let quality: IntradayHistoryQuality = { ...emptyQuality(), affected: [] };
  let producerError: unknown;
  const input = backtestStream(run, async id => (await engineInstruments([id], run.config.to, false, plan, false, 500000))[0], stock => {
    if (plan.replay !== '1m') return;
    const item = intradayHistoryQuality([stock], run.config, run.strategy.risk.overnight);
    qualities.set(stock.id,item);
    for (const key of Object.keys(emptyQuality()) as (keyof QualityCounts)[]) quality[key] += item[key];
    quality.affected.push(...item.affected);
  }, replayInstrumentId);
  const stream = Readable.from((async function* () {
    try { yield* input; } catch (error) { producerError = error; throw error; }
  })(), { objectMode: false, highWaterMark: 64 * 1024 });
  try {
    const { data } = await engineClient.post<Record<string, unknown>>('/backtest-stream', stream, {
      headers: { 'Content-Type': 'application/x-ndjson' }, maxBodyLength: BACKTEST_STREAM_BYTES, timeout: 600000,
    });
    const audit=data.selectionAudit as {policy:string;includedIds:string[]}|undefined;
    if(audit?.policy==='ready'){
      quality={...emptyQuality(),affected:[]};
      for(const id of audit.includedIds){const item=qualities.get(id);if(!item)continue;
        for(const key of Object.keys(emptyQuality()) as (keyof QualityCounts)[])quality[key]+=item[key];
        quality.affected.push(...item.affected);
      }
    }
    if (plan.replay === '1m') data.historyQuality = quality;
    return data;
  } catch (error) { throw producerError ?? error; }
  finally { stream.destroy(); }
}
