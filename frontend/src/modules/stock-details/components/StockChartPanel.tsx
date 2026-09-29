import { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Segmented, Skeleton, Space, Tag, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { StockCandlestickChart } from '../../../components/charts/StockCandlestickChart';
import { useStockResource } from '../hooks/useStockResource';
import { useIndicatorHistory } from '../hooks/useIndicatorHistory';
import { ChartIndicators } from './ChartIndicators';
import { defaultIndicators, indicatorLabel, plotIndicator, strategyIndicators, type ChartIndicator } from '../utils/chartIndicators';
import { barEnd, frameOptions, isIntraday } from '../utils/chartTime';
import { liveChart } from '../utils/liveChart';
import { visibleChartEvents } from '../utils/chartEvents';
import type { ChartEvent, ChartLevel, LiveChartBar, StockChartData, StockQuote, StockTimeframe } from '../types';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';

const noBars: LiveChartBar[] = [], noEvents: ChartEvent[] = [];
export function StockChartPanel({ instrumentId, symbol, quote, liveBars = noBars, now, strategy, events = noEvents, levels, focusEventId, onSelectEvent, historyAt, historyPath, visibleRange }: {
  instrumentId: string; symbol: string; quote?: StockQuote; liveBars?: LiveChartBar[]; now: number;
  strategy?: SavedStrategy; events?: ChartEvent[]; levels?: ChartLevel[]; focusEventId?: string; onSelectEvent?: (id: string) => void; historyAt?: string;
  historyPath?: string; visibleRange?: { from: string; to: string };
}) {
  const [timeframe, setTimeframe] = useState<StockTimeframe>(() => strategy && strategy.entry.cadence !== 'daily' ? strategy.entry.cadence : '1d');
  const [kind, setKind] = useState<'candles' | 'line'>('candles'), [showStrategy, setShowStrategy] = useState(true), [showTrades, setShowTrades] = useState(true);
  const [custom, setCustom] = useState<ChartIndicator[]>(() => strategy ? [] : defaultIndicators);
  const [hoverTime, setHoverTime] = useState<string>();
  const chart = useStockResource<StockChartData>(`${historyPath ?? `/stocks/${encodeURIComponent(instrumentId)}/chart`}?timeframe=${timeframe}${historyAt ? `&at=${encodeURIComponent(historyAt)}` : ''}`, historyAt ? undefined : 60_000);
  const strategyConfig = useMemo(() => strategyIndicators(strategy), [strategy]);
  const configs = useMemo(() => [...(showStrategy ? strategyConfig.indicators : []), ...custom], [showStrategy, strategyConfig, custom]);
  const extraFrames = configs.flatMap(i => i.timeframe !== 'chart' && i.timeframe !== timeframe ? [i.timeframe] : []);
  const otherHistory = useIndicatorHistory(instrumentId, extraFrames, historyAt, historyPath);
  const view = useMemo(() => chart.data ? historyAt ? { bars: chart.data.bars, partial: false, forming: false } : liveChart(chart.data, liveBars, quote, now) : { bars: [], partial: false, forming: false }, [chart.data, liveBars, quote, now, historyAt]);
  const plots = useMemo(() => configs.flatMap(i => {
    const frame = i.timeframe === 'chart' ? timeframe : i.timeframe;
    // Partial previews are visual only, excluded from all indicator calculations.
    const source = frame === timeframe ? i.strategy || view.partial ? chart.data?.bars ?? [] : view.bars : otherHistory.data[frame]?.bars ?? [];
    return plotIndicator(i, source, view.bars, timeframe, historyAt ? Date.parse(historyAt) : now);
  }), [configs, timeframe, view.partial, view.bars, chart.data, otherHistory.data, historyAt, now]);
  const shownEvents = showTrades ? events : noEvents;
  const visibleEvents = visibleChartEvents(shownEvents, view.bars, timeframe);
  const missingEvent = focusEventId && showTrades && events.some(e => e.id === focusEventId) && !visibleEvents.some(e => e.id === focusEventId);
  const indicatorWarnings = [...new Set(extraFrames)].flatMap(frame => otherHistory.data[frame]?.message ? [`${frame}: ${otherHistory.data[frame]!.message}`] : []);
  return <section className="stock-chart-section" aria-label="Price chart">
    <div className="stock-section-heading"><h3>Price & volume</h3><Space size={8} wrap>
      <ChartIndicators custom={custom} onChange={setCustom} strategy={strategyConfig.indicators} showStrategy={showStrategy} onShowStrategy={setShowStrategy} timeframe={timeframe}/>
      <Tooltip title="Refresh chart history"><Button aria-label="Refresh chart" icon={<ReloadOutlined />} loading={chart.loading} onClick={chart.retry} size="small" /></Tooltip>
    </Space></div>
    <div className="stock-chart-controls"><Segmented aria-label="Chart timeframe" size="small" value={timeframe} options={frameOptions} onChange={setTimeframe}/><Space wrap>{(!!events.length || !!levels?.length) && <Checkbox checked={showTrades} onChange={e => setShowTrades(e.target.checked)}>Trades & signals</Checkbox>}<Segmented aria-label="Chart style" size="small" value={kind} options={[{ value: 'candles', label: 'Candles' }, { value: 'line', label: 'Line' }]} onChange={setKind}/></Space></div>
    {!!configs.length && <p className="stock-chart-note">Indicator values · {hoverTime ? `crosshair at ${new Date(hoverTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'latest available candle'}</p>}
    <div className="chart-indicator-legend" aria-label="Visible indicators">{configs.map(i => {
      const line = plots.find(p => p.id === `${i.id}-0`), last = hoverTime ? line?.values.findLast(p => p.time <= hoverTime) : line?.values.at(-1);
      const frame = i.timeframe === 'chart' ? timeframe : i.timeframe;
      const unavailable = i.kind === 'vwap' && !isIntraday(frame) ? 'Intraday only' : (frame === timeframe ? chart.data : otherHistory.data[frame]) ? 'Insufficient history' : 'Loading history';
      return <span key={i.id}><i style={{ background: i.color }}/>{indicatorLabel(i,timeframe)} <b>{last ? last.value.toLocaleString('en-IN',{maximumFractionDigits:2}) : unavailable}</b></span>;
    })}</div>
    {chart.data?.latestCandleAt && <p className="stock-chart-note" aria-label="Chart data timestamp">Stored candles through {new Date(chart.data.latestCandleAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. {view.forming ? <Tag color={view.partial ? 'gold' : 'blue'}>{view.partial ? 'Forming · incomplete preview' : view.bars.at(-1) && barEnd(view.bars.at(-1)!.time,timeframe) <= now ? 'Session preview · awaiting final history' : 'Forming candle'}</Tag> : <Tag>Completed candles</Tag>}</p>}
    {view.partial && <p className="stock-chart-note">The current candle shows received ticks only. Earlier ticks are missing; indicators exclude this preview until history is available.</p>}
    {(chart.error || chart.data?.message) && <Alert className="stock-inline-alert" type="warning" showIcon title={chart.error || chart.data?.message} action={<Button size="small" onClick={chart.retry}>Retry</Button>}/>}
    {!!otherHistory.errors.length && <Alert type="warning" showIcon title={otherHistory.errors.join(' ')}/>}
    {!!indicatorWarnings.length && <Alert type="warning" showIcon title="Some indicator history has gaps" description={indicatorWarnings.join(' ')}/>}
    {otherHistory.loading && <p className="muted">Loading the strategy’s other timeframes…</p>}
    {missingEvent && <Alert type="info" showIcon title="The selected event has no candle in this interval’s loaded history." description="Its recorded time and price remain in the activity list. Try a daily chart for older trades."/>}
    {chart.loading && !chart.data ? <div className="stock-chart-loading"><Skeleton active paragraph={{ rows: 5 }}/><p>Loading price history. The first download can take longer.</p></div> : view.bars.length ?
      <StockCandlestickChart key={timeframe} bars={view.bars} quote={quote} timeframe={timeframe} kind={kind} symbol={symbol} indicators={plots} events={shownEvents} levels={showTrades ? levels : undefined} focusEventId={focusEventId} onSelectEvent={onSelectEvent} onHoverTime={setHoverTime} visibleRange={visibleRange}/> :
      <div className="stock-chart-empty"><Empty description="No chart history available for this interval"/><Button onClick={chart.retry}>Try again</Button></div>}
    <p className="stock-chart-note">{historyAt ? 'Historical review · markers are simulated backtest fills, not paper or live orders. Candles come from the stored market history and may include later corrections.' : <>{isIntraday(timeframe) ? `Recent ${timeframe.endsWith('h') ? '60' : '7'} days · historical candles refresh each minute.` : 'Up to 6 years of daily history.'} Live previews never trigger a trade.</>} Strategy rules use completed candles; chart settings only change this view.</p>
    {!!shownEvents.length && <p className="stock-chart-note">{historyAt ? '↑ / ↓ Arrows: backtest fills' : '● Blue circles: signals · ↑ / ↓ Arrows: actual paper fills'} · {visibleEvents.length} of {shownEvents.length} events in loaded candles. Select a marker to inspect it.</p>}
    {showStrategy && !!strategyConfig.unsupported.length && <p className="stock-chart-note">Other strategy conditions ({strategyConfig.unsupported.join(', ')}) are shown in the rule checks rather than plotted as indicators.</p>}
  </section>;
}
