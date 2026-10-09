import { GuidanceNote } from '../../../components/feedback/GuidanceNote';
import { ChartGapDetails } from './ChartGapDetails';
import { indicatorCatalog } from '../utils/indicatorCatalog';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Popover, Segmented, Skeleton, Space, Tag, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { StockCandlestickChart } from '../../../components/charts/StockCandlestickChart';
import { useStockResource } from '../hooks/useStockResource';
import { useIndicatorHistory } from '../hooks/useIndicatorHistory';
import { useBenchmarkHistory, benchmarkKey } from '../hooks/useBenchmarkHistory';
import { ChartIndicators } from './ChartIndicators';
import { indicatorFrame, indicatorLabel, plotIndicator, strategyIndicators } from '../utils/chartIndicators';
import { anchorHistoryIssue, indicatorHistoryNeeds, indicatorUnavailable } from '../utils/indicatorSettings';
import { useChartPreferences } from '../store/chartPreferences';
import { ChartLayouts } from './ChartLayouts';
import { ChartAppearanceControls } from './ChartAppearanceControls';
import { barEnd, frameOptions } from '../utils/chartTime';
import { liveChart } from '../utils/liveChart';
import { visibleChartEvents } from '../utils/chartEvents';
import type { ChartEvent, ChartLevel, LiveChartBar, StockChartData, StockQuote, StockTimeframe } from '../types';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';

const noBars: LiveChartBar[] = [], noEvents: ChartEvent[] = [];
export interface StockChartPanelProps {
  compact?: boolean; instrumentId: string; symbol: string; quote?: StockQuote; liveBars?: LiveChartBar[]; now: number;
  strategy?: SavedStrategy; events?: ChartEvent[]; levels?: ChartLevel[]; focusEventId?: string; onSelectEvent?: (id: string) => void; historyAt?: string;
  historyPath?: string; visibleRange?: { from: string; to: string };
}
export function StockChartPanel({ compact = false, instrumentId, symbol, quote, liveBars = noBars, now, strategy, events = noEvents, levels, focusEventId, onSelectEvent, historyAt, historyPath, visibleRange }: StockChartPanelProps) {
  const mode = strategy ? 'strategy' : 'research';
  const profile = useChartPreferences(s => s[mode]), update = useChartPreferences(s => s.update);
  const { custom, kind, showVolume = true } = profile;
  const timeframe = profile.timeframe ?? (strategy && strategy.entry.cadence !== 'daily' ? strategy.entry.cadence : '1d');
  const [showStrategy, setShowStrategy] = useState(true), [showTrades, setShowTrades] = useState(true);
  const chartIdentity = `${instrumentId}:${timeframe}`;
  const [hover, setHover] = useState<{ identity: string; time?: string }>();
  const hoverTime = hover?.identity === chartIdentity ? hover.time : undefined;
  const setHoverTime = useCallback((time?: string) => setHover(previous =>
    previous?.identity === chartIdentity && previous.time === time ? previous : { identity: chartIdentity, time }), [chartIdentity]);
  const strategyConfig = useMemo(() => strategyIndicators(strategy), [strategy]);
  const configs = useMemo(() => [...(showStrategy ? strategyConfig.indicators : []), ...custom.filter(i => i.visible !== false)].filter(i => showVolume || i.kind !== 'volumeSma'), [showStrategy, strategyConfig, custom, showVolume]);
  const needs = useMemo(() => indicatorHistoryNeeds(configs, timeframe), [configs, timeframe]);
  const params = new URLSearchParams({ timeframe });
  if (historyAt) params.set('at', historyAt);
  if (!historyPath && needs[timeframe]) { params.set('minBars', String(needs[timeframe]!.minBars)); if (needs[timeframe]!.from) params.set('from', needs[timeframe]!.from!); }
  const chart = useStockResource<StockChartData>(`${historyPath ?? `/stocks/${encodeURIComponent(instrumentId)}/chart`}?${params}`, historyAt ? undefined : 60_000, undefined, historyPath || historyAt ? '' : 'repair=true');
  const extraFrames = (Object.keys(needs) as StockTimeframe[]).filter(frame => frame !== timeframe);
  const otherNeeds = Object.fromEntries(Object.entries(needs).filter(([frame]) => frame !== timeframe));
  const otherHistory = useIndicatorHistory(instrumentId, extraFrames, historyAt, historyPath, otherNeeds);
  const benchmarkFrom = [chart.data?.requestedFrom,chart.data?.bars[0]?.time.slice(0,10),...Object.values(otherHistory.data).map(d=>d?.requestedFrom??d?.bars[0]?.time.slice(0,10))].filter((v):v is string=>!!v).sort()[0];
  const benchmarks=useBenchmarkHistory(configs,timeframe,benchmarkFrom,historyAt);
  const view = useMemo(() => chart.data ? historyAt ? { bars: chart.data.bars, partial: false, forming: false } : liveChart(chart.data, liveBars, quote, now) : { bars: [], partial: false, forming: false }, [chart.data, liveBars, quote, now, historyAt]);
  const plots = useMemo(() => configs.flatMap(i => {
    const frame = indicatorFrame(i, timeframe);
    if (anchorHistoryIssue(i, frame === timeframe ? chart.data : otherHistory.data[frame])) return [];
    // Partial previews are visual only, excluded from all indicator calculations.
    const source = frame === timeframe ? i.strategy || view.partial ? chart.data?.bars ?? [] : view.bars : otherHistory.data[frame]?.bars ?? [];
    return plotIndicator(i, source, view.bars, timeframe, historyAt ? Date.parse(historyAt) : now,benchmarks.data[benchmarkKey(i,timeframe)]?.bars, i.timeframe === 'chart' || i.timeframe === timeframe ? view.bars : otherHistory.data[i.timeframe]?.bars);
  }), [configs, timeframe, view.partial, view.bars, chart.data, otherHistory.data, historyAt, now,benchmarks.data]);
  const shownEvents = showTrades ? events : noEvents;
  const visibleEvents = visibleChartEvents(shownEvents, view.bars, timeframe);
  const missingEvent = focusEventId && showTrades && events.some(e => e.id === focusEventId) && !visibleEvents.some(e => e.id === focusEventId);
  const indicatorWarnings = [...new Set(extraFrames)].flatMap(frame => otherHistory.data[frame]?.message ? [`${frame}: ${otherHistory.data[frame]!.message}`] : []);
  return <section className={`stock-chart-section ${compact ? 'stock-chart-section--compact' : ''}`} aria-label="Price chart">
    <div className="stock-section-heading"><h3>Price & volume</h3><Space size={8} wrap>
      <ChartLayouts profile={{ ...profile, timeframe, showVolume }} onApply={value => update(mode, value)}/>
      <ChartIndicators showVolume={showVolume} volumeStyle={profile.volumeStyle} onVolumeChange={change=>update(mode,change)} custom={custom} onChange={value => update(mode, { custom: value })} strategy={strategyConfig.indicators} showStrategy={showStrategy} onShowStrategy={setShowStrategy} timeframe={timeframe}/>
      <Tooltip title="Refresh chart history"><Button aria-label="Refresh chart" icon={<ReloadOutlined />} loading={chart.loading} onClick={chart.retry} size="small" /></Tooltip>
    </Space></div>
    <div className="stock-chart-controls"><div className="stock-chart-control-group"><span>Candle interval</span><Segmented aria-label="Chart timeframe" size="small" value={timeframe} options={frameOptions} onChange={value => update(mode, { timeframe: value })}/></div><Space wrap>{(!!events.length || !!levels?.length) && <Checkbox checked={showTrades} onChange={e => setShowTrades(e.target.checked)}>Trades & signals</Checkbox>}<ChartAppearanceControls kind={kind} showVolume={showVolume} onKindChange={value => update(mode, { kind: value })} onVolumeChange={value => update(mode, { showVolume: value })}/></Space></div>
    <p className="stock-chart-interval-note">Each candle represents {timeframe === '1d' ? 'one trading day' : timeframe === '1w' ? 'one week' : timeframe === '1mo' ? 'one month' : `${parseInt(timeframe)} ${timeframe.endsWith('h') ? 'hour' : 'minute'}${parseInt(timeframe) === 1 ? '' : 's'}`}. Zoom or pan to change the period shown.</p>
    {!compact && !!configs.length && <p className="stock-chart-note">Indicator values · {hoverTime ? `crosshair at ${new Date(hoverTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'latest available candle'}</p>}
    <div className="chart-indicator-legend" aria-label="Visible indicators">{configs.map(i => {
      const lines = plots.filter(p => p.id.startsWith(`${i.id}-`));
      const values = lines.map(line => hoverTime ? line.values.find(p => p.time === hoverTime) : line.values.at(-1));
      const frame = indicatorFrame(i, timeframe);
      const source = frame === timeframe ? chart.data ? i.strategy || view.partial ? chart.data.bars : view.bars : undefined : otherHistory.data[frame]?.bars;
      const benchmark = benchmarkKey(i, timeframe);
      const unavailable = anchorHistoryIssue(i, frame === timeframe ? chart.data : otherHistory.data[frame]) ?? (hoverTime ? 'No value for this candle' : indicatorUnavailable(i, timeframe, source, historyAt ? Date.parse(historyAt) : now, view.partial, {
        stockLoading: frame === timeframe ? chart.loading : otherHistory.loading,
        stockUnavailable: frame === timeframe ? !!chart.error : !otherHistory.loading && !otherHistory.data[frame],
        benchmarkLoading: benchmarks.loading,
        benchmarkUnavailable: !!benchmarks.errorsByKey[benchmark],
        benchmarkBars: benchmarks.data[benchmark]?.bars,
      }));
      const names = lines.map(line=>indicatorCatalog[i.kind].lines[Number(line.id.slice(line.id.lastIndexOf('-')+1))]);
      return <span key={i.id}><i style={{ background: i.color }}/>{indicatorLabel(i,timeframe)} <b>{values.some(Boolean) ? values.map((value, index) => `${indicatorCatalog[i.kind].lines.length > 1 ? `${names[index]} ` : ''}${value ? value.value.toLocaleString('en-IN',{maximumFractionDigits:2}) : '—'}`).join(' · ') : !lines.length && i.lineStyles && Object.values(i.lineStyles).every(s=>s.visible===false) ? 'Lines hidden' : unavailable}</b></span>;
    })}</div>
    {chart.data?.latestCandleAt && <p className="stock-chart-note" aria-label="Chart data timestamp">Stored candles through {new Date(chart.data.latestCandleAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. {view.forming ? <Tag color={view.partial ? 'gold' : 'blue'}>{view.partial ? 'Forming · incomplete preview' : view.bars.at(-1) && barEnd(view.bars.at(-1)!.time,timeframe) <= now ? 'Session preview · awaiting final history' : 'Forming candle'}</Tag> : <Tag>Completed candles</Tag>}</p>}
    {view.partial && <p className="stock-chart-note">The current candle shows received ticks only. Earlier ticks are missing; indicators exclude this preview until history is available.</p>}
    {(chart.error || chart.data?.message) && <Alert className="stock-inline-alert" type="warning" showIcon title={chart.error || chart.data?.message} action={<Space>{!!chart.data?.incompleteIntervals?.length && <Popover trigger="click" title="Missing candle times (IST)" content={<div style={{maxWidth:360}}><ChartGapDetails data={chart.data}/></div>}><Button size="small">View gaps</Button></Popover>}<Button size="small" loading={chart.loading} onClick={chart.retry}>{chart.loading ? 'Checking history...' : 'Retry'}</Button></Space>}/>}
    {!!otherHistory.errors.length && <Alert type="warning" showIcon title={otherHistory.errors.join(' ')}/>}
    {!!benchmarks.errors.length&&<Alert type="warning" showIcon title="Benchmark history unavailable" description={benchmarks.errors.join(' ')}/>}
    {!!indicatorWarnings.length && <Alert type="warning" showIcon title="Some indicator history has gaps" description={indicatorWarnings.join(' ')}/>}
    {otherHistory.loading && <p className="muted">Loading indicator history for the other timeframes…</p>}
    {missingEvent && <GuidanceNote type="info" showIcon title="The selected event has no candle in this interval’s loaded history." description="Its recorded time and price remain in the activity list. Try a daily chart for older trades."/>}
    {chart.loading && !chart.data ? <div className="stock-chart-loading"><Skeleton active paragraph={{ rows: 5 }}/><p>Loading price history. The first download can take longer.</p></div> : view.bars.length ?
      <StockCandlestickChart key={chartIdentity} bars={view.bars} quote={quote} timeframe={timeframe} kind={kind} symbol={symbol} volumeStyle={profile.volumeStyle} showVolume={showVolume} indicators={plots} events={shownEvents} levels={showTrades ? levels : undefined} focusEventId={focusEventId} onSelectEvent={onSelectEvent} onHoverTime={setHoverTime} visibleRange={visibleRange}/> :
      <div className="stock-chart-empty"><Empty description="No chart history available for this interval"/><Button onClick={chart.retry}>Try again</Button></div>}
    {configs.some(i=>i.kind==='maCross'&&i.showCrosses!==false)&&<p className="stock-chart-note">Cross markers show completed MA crossovers for chart analysis. They are not buy/sell orders or strategy signals.</p>}
    <p className="stock-chart-note">{historyAt || historyPath ? 'Historical review uses stored candles only. Extra chart indicators may need history outside this run. Markers are simulated backtest fills, not paper or live orders.' : <>History loads for your indicators and is reused from the local database. {chart.data?.requestedFrom && `Requested from ${chart.data.requestedFrom}. `}New listings may have fewer candles. Live previews never trigger a trade.</>} Strategy rules use completed candles; chart settings only change this view.</p>
    {!!shownEvents.length && <p className="stock-chart-note">{historyAt ? '↑ / ↓ Arrows: backtest fills' : '● Blue circles: signals · ↑ / ↓ Arrows: actual paper fills'} · {visibleEvents.length} of {shownEvents.length} events in loaded candles. Select a marker to inspect it.</p>}
    {showStrategy && !!strategyConfig.unsupported.length && <p className="stock-chart-note">Other strategy conditions ({strategyConfig.unsupported.join(', ')}) are shown in the rule checks rather than plotted as indicators.</p>}
  </section>;
}
