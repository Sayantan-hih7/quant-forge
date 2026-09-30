import { Collapse, Tag } from 'antd';
import { useBenchmarkHistory, benchmarkKey } from '../hooks/useBenchmarkHistory';
import type { ChartIndicator } from '../utils/chartIndicators';
import type { StockChartData } from '../types';
import { stockBeta } from '../utils/beta';
import { stockNumber } from '../utils/format';

export function StockBeta({ instrumentId, history, loading, error, now }: { instrumentId: string; history?: StockChartData; loading: boolean; error?: string; now: number }) {
  const benchmark = instrumentId.startsWith('BSE:') ? 'SENSEX' : 'NIFTY 50';
  const config: ChartIndicator = { id: 'beta-benchmark', kind: 'relativeStrength', period: 252, timeframe: '1d', benchmark, color: '#4062d9' };
  const from = history?.requestedFrom ?? history?.bars[0]?.time.slice(0, 10);
  const reference = useBenchmarkHistory([config], '1d', from);
  const key = benchmarkKey(config, '1d'), data = reference.data[key];
  const result = stockBeta(history?.bars ?? [], data?.bars ?? [], now);
  const waiting = loading || !!from && reference.loading;
  const failure = error || reference.errorsByKey[key];
  return <section className="stock-beta" aria-label="Stock beta">
    <div className="stock-section-heading"><div><h3>Beta <span className="muted">vs {benchmark}</span></h3><p className="muted">Sensitivity to market movements · 252 daily returns</p></div><strong className="stock-beta-value">{stockNumber(result.value)}</strong></div>
    {result.value !== null ? <><Tag>{result.value < 0 ? 'Opposite historical relationship' : Math.abs(result.value - 1) < 0.005 ? 'Market-like sensitivity' : result.value > 1 ? 'Higher market sensitivity' : 'Lower market sensitivity'}</Tag><span className="muted">{result.pairs} matched returns · {result.from} to {result.to}</span></> : <p className="muted">{waiting ? 'Loading stock and benchmark history…' : failure ? 'Beta unavailable: stock or benchmark history could not be fully loaded.' : result.reason === 'no-benchmark-variation' ? 'Beta cannot be calculated because benchmark returns have no variation.' : `Needs 253 matching completed daily prices (252 returns) · ${result.pairs} matched returns available. New listings may not have enough history yet.`}</p>}
    {!waiting && failure && result.value !== null && <p className="muted">Calculated from saved history; the latest data could not be refreshed.</p>}
    <Collapse ghost size="small" items={[{ key: 'method', label: 'What beta means', children: <><p>A beta of 1 means market-like sensitivity. Above 1 means greater sensitivity to benchmark moves; between 0 and 1 means lower sensitivity. A negative beta indicates an opposite historical relationship, not automatically a safer stock.</p><p>Calculated as covariance of matched stock and benchmark returns divided by benchmark-return variance, using completed daily closing prices supplied by Dhan. This is price-return beta, not dividend-inclusive total-return beta. It describes past behaviour and does not count as a bullish or bearish vote.</p></> }]} />
  </section>;
}
