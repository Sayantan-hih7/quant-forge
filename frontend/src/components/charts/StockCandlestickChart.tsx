import type { VolumeStyle } from '../../modules/stock-details/utils/volumeSettings';
import { IndicatorCloud } from './IndicatorCloud';
import { useEffect, useRef, useState } from 'react';
import { theme } from 'antd';
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, TickMarkType, createChart, createSeriesMarkers,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import type { ChartBar, ChartEvent, ChartLevel, StockQuote, StockTimeframe } from '../../modules/stock-details/types';
import type { IndicatorLine } from '../../modules/stock-details/utils/chartIndicators';
import { bucketTime, isIntraday } from '../../modules/stock-details/utils/chartTime';
import { visibleChartEvents } from '../../modules/stock-details/utils/chartEvents';
import { stockNumber } from '../../modules/stock-details/utils/format';

function chartTime(time: string): Time { return time.length === 10 ? time : Math.floor(Date.parse(time) / 1000) as UTCTimestamp; }
function formatTime(time: Time) {
  if (typeof time === 'number') return new Date(time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  if (typeof time === 'string') return new Date(`${time}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${time.day}/${time.month}/${time.year}`;
}
interface ChartRefs {
  cloud: IndicatorCloud; chart: IChartApi; candles: ISeriesApi<'Candlestick'>; line: ISeriesApi<'Line'>; volume?: ISeriesApi<'Histogram'>;
  extras: Map<string, ISeriesApi<'Line'> | ISeriesApi<'Histogram'>>; layout: string; markers: ISeriesMarkersPluginApi<Time>[];
  prices: IPriceLine[]; levels: IPriceLine[][]; fitted: boolean; focused?: string; bars: Map<Time, ChartBar>;
}
const noLines: IndicatorLine[] = [], noEvents: ChartEvent[] = [], noLevels: ChartLevel[] = [];
export function StockCandlestickChart({ bars, quote, timeframe, kind, symbol, volumeStyle, showVolume = true, fitAll = false, indicators = noLines, events = noEvents, levels = noLevels, focusEventId, onSelectEvent, onHoverTime, visibleRange, replayStep }: {
  bars: ChartBar[]; quote?: StockQuote; timeframe: StockTimeframe; kind: 'candles' | 'line'; symbol: string;
  indicators?: IndicatorLine[]; events?: ChartEvent[]; levels?: ChartLevel[]; focusEventId?: string; onSelectEvent?: (id: string) => void; onHoverTime?: (time?: string) => void;
  visibleRange?: { from: string; to: string };
  replayStep?: string;
  showVolume?: boolean; fitAll?: boolean; volumeStyle?: VolumeStyle;
}) {
  const container = useRef<HTMLDivElement>(null), refs = useRef<ChartRefs | null>(null), select = useRef(onSelectEvent);
  const hovered = useRef(onHoverTime);
  const [hover, setHover] = useState<(ChartBar & { replayStep?: string }) | null>(null);
  const replayVersion = useRef(replayStep);
  const { token } = theme.useToken();
  const { colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError } = token;
  const paneCount = new Set(indicators.filter(i => !['price', 'volume'].includes(i.pane)).map(i => i.pane)).size;
  const height = 410 + paneCount * 105;
  useEffect(() => { select.current = onSelectEvent; }, [onSelectEvent]);
  useEffect(() => { hovered.current = onHoverTime; }, [onHoverTime]);
  useEffect(() => { replayVersion.current = replayStep; }, [replayStep]);
  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    const chart = createChart(container.current, {
      autoSize: false, width: element.clientWidth, height: element.clientHeight, layout: { background: { type: ColorType.Solid, color: colorBgContainer }, textColor: colorTextSecondary, fontFamily: 'Inter Variable, sans-serif', fontSize: 10, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: colorBorderSecondary, style: LineStyle.Dotted } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: isIntraday(timeframe), secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) => typeof time === 'number' && (type === TickMarkType.Time || type === TickMarkType.TimeWithSeconds) ? new Date(time * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) : null },
      localization: { locale: 'en-IN', timeFormatter: formatTime },
      crosshair: { vertLine: { color: colorTextSecondary, style: LineStyle.Dashed }, horzLine: { color: colorTextSecondary, style: LineStyle.Dashed } },
    });
    const priceFormat = { type: 'custom' as const, minMove: 0.01, formatter: (value: number) => stockNumber(value) };
    const candles = chart.addSeries(CandlestickSeries, { priceFormat, upColor: colorSuccess, downColor: colorError, wickUpColor: colorSuccess, wickDownColor: colorError, borderVisible: false, priceLineVisible: false, lastValueVisible: false });
    const line = chart.addSeries(LineSeries, { priceFormat, color: '#5477e7', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    chart.panes()[0].setStretchFactor(4);
    const prices = [candles, line].map(series => series.createPriceLine({ price: 0, color: colorTextSecondary, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: 'LTP', lineVisible: false }));
    const markers = [createSeriesMarkers(candles, [], { autoScale: false }), createSeriesMarkers(line, [], { autoScale: false })];
    const cloud = new IndicatorCloud(); candles.attachPrimitive(cloud);
    refs.current = { cloud, chart, candles, line, prices, extras: new Map(), layout: '', markers, levels: [[], []], fitted: false, bars: new Map() };
    chart.subscribeCrosshairMove(event => {
      const value = event.time && refs.current?.bars.get(typeof event.time === 'object' ? `${event.time.year}-${String(event.time.month).padStart(2, '0')}-${String(event.time.day).padStart(2, '0')}` : event.time);
      setHover(value ? { ...value, time: formatTime(event.time!), replayStep: replayVersion.current } : null);
      hovered.current?.(value ? value.time : undefined);
    });
    chart.subscribeClick(event => { if (typeof event.hoveredObjectId === 'string' && !event.hoveredObjectId.startsWith('indicator-cross:')) select.current?.(event.hoveredObjectId); });
    // Resize outside the observer's layout pass: changing panes or drawer width
    // must not recursively deliver another resize notification in the same frame.
    let resizeFrame = 0, lastWidth = element.clientWidth, lastHeight = element.clientHeight;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const width = element.clientWidth, height = element.clientHeight;
        if (width > 0 && height > 0 && (width !== lastWidth || height !== lastHeight)) {
          lastWidth = width; lastHeight = height; chart.resize(width, height);
        }
      });
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); refs.current = null; chart.remove(); };
  }, [timeframe, colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError]);
  useEffect(() => {
    const view = refs.current; if (!view) return;
    view.bars = new Map(bars.map(bar => [chartTime(bar.time), bar]));
    view.candles.setData(bars.map(bar => ({ ...bar, time: chartTime(bar.time) })));
    view.line.setData(bars.map(bar => ({ time: chartTime(bar.time), value: bar.close })));
    const shownIndicators = indicators.filter(i => showVolume || i.pane !== 'volume');
    const layout = `${showVolume}:` + shownIndicators.map(i => `${i.id}:${i.pane}:${i.histogram}:${JSON.stringify(i.guides)}`).join('|');
    if (layout !== view.layout) {
      for (const series of [...view.extras.values()].reverse()) view.chart.removeSeries(series);
      view.extras.clear(); view.layout = layout;
      if (view.volume) { view.chart.removeSeries(view.volume); view.volume = undefined; }
      if (showVolume) {
        view.volume = view.chart.addSeries(HistogramSeries, { title: 'Volume', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
        view.chart.panes()[1].setStretchFactor(1);
      }
      const firstStudyPane = showVolume ? 2 : 1;
      const panes = new Map<string, number>();
      for (const i of shownIndicators) {
        if (!['price', 'volume'].includes(i.pane) && !panes.has(i.pane)) panes.set(i.pane, panes.size + firstStudyPane);
        const pane = i.pane === 'price' ? 0 : i.pane === 'volume' ? 1 : panes.get(i.pane)!;
        const options = { title: i.label.replace(' · Strategy', ''), color: i.color, priceLineVisible: false, lastValueVisible: false, priceFormat: i.pane === 'volume' ? { type: 'volume' as const } : { type: 'price' as const, precision: 2, minMove: 0.01 } };
        view.extras.set(i.id, i.histogram ? view.chart.addSeries(HistogramSeries, options, pane) : view.chart.addSeries(LineSeries, { ...options, lineWidth: i.lineWidth ?? 1 }, pane));
        for(const value of i.guides??[])view.extras.get(i.id)?.createPriceLine({price:value,color:colorTextSecondary,lineStyle:LineStyle.Dashed,lineWidth:1,axisLabelVisible:false,title:''});
        if (pane >= firstStudyPane) view.chart.panes()[pane].setStretchFactor(1.25);
      }
    }
    view.volume?.setData(bars.map(bar => ({ time: chartTime(bar.time), value: bar.volume, color: bar.close >= bar.open ? `${volumeStyle?.upColor??colorSuccess}${Math.round((volumeStyle?.opacity??44)/100*255).toString(16).padStart(2,'0')}` : `${volumeStyle?.downColor??colorError}${Math.round((volumeStyle?.opacity??44)/100*255).toString(16).padStart(2,'0')}` })));
    for (const i of shownIndicators) {
      const series = view.extras.get(i.id);
      series?.applyOptions({ title: i.label.replace(' · Strategy', ''), color: i.color, ...(!i.histogram ? { lineWidth: i.lineWidth ?? 1 } : {}) });
      series?.setData(i.values.map(p => ({ time: chartTime(p.time), value: p.value, ...(i.histogram ? { color: i.histogramColor ?? (p.value >= 0 ? `${colorSuccess}80` : `${colorError}80`) } : {}) })));
    }
    view.cloud.update(shownIndicators.filter(i=>i.cloud==='a').map(a=>{const b=shownIndicators.find(i=>i.cloud==='b'&&i.id.slice(0,-2)===a.id.slice(0,-2));const lower=new Map(b?.values.map(p=>[p.time,p.value])??[]);return a.values.flatMap(p=>lower.has(p.time)?[{time:chartTime(p.time),upper:p.value,lower:lower.get(p.time)!}]:[]);}),[`${colorSuccess}25`,`${colorError}25`]);
    view.candles.applyOptions({ visible: kind === 'candles' }); view.line.applyOptions({ visible: kind === 'line' });
    const visible = visibleChartEvents(events, bars, timeframe);
    const markers = visible.map(e => ({ id: e.id, time: chartTime(e.time), position: e.side === 'BUY' ? 'belowBar' as const : 'aboveBar' as const,
      color: e.kind === 'signal' ? '#5477e7' : e.side === 'BUY' ? colorSuccess : colorError,
      shape: e.kind === 'signal' ? 'circle' as const : e.side === 'BUY' ? 'arrowUp' as const : 'arrowDown' as const,
      text: e.kind === 'signal' ? `${e.side} signal` : `${e.kind === 'backtest' ? 'BT ' : ''}${e.side} ${e.quantity} @ ${stockNumber(e.price!)}`, size: e.id === focusEventId ? 2 : 1,
    }));
    const crossMarkers = shownIndicators.flatMap(i=>(i.markers??[]).map((m,index)=>({id:`indicator-cross:${i.id}:${index}`,time:chartTime(m.time),position:m.direction==='above'?'belowBar' as const:'aboveBar' as const,color:m.direction==='above'?'#8064d8':'#c58822',shape:'square' as const,text:m.label,size:1})));
    const allMarkers=[...markers,...crossMarkers].sort((a,b)=>Number(typeof a.time==='number'?a.time:Date.parse(String(a.time))/1000)-Number(typeof b.time==='number'?b.time:Date.parse(String(b.time))/1000));
    view.markers[0].setMarkers(kind === 'candles' ? allMarkers : []); view.markers[1].setMarkers(kind === 'line' ? allMarkers : []);
    [view.candles, view.line].forEach((series, index) => {
      for (const level of view.levels[index]) series.removePriceLine(level);
      view.levels[index] = levels.map(level => series.createPriceLine({ price: level.price, title: level.label, axisLabelVisible: true,
        color: level.kind === 'stop' ? colorError : level.kind === 'target' ? colorSuccess : level.kind === 'initial-stop' ? colorTextSecondary : '#5477e7',
        lineStyle: level.kind === 'initial-stop' ? LineStyle.Dotted : LineStyle.Dashed, lineWidth: level.kind === 'stop' ? 2 : 1 }));
    });
    for (const price of view.prices) price.applyOptions(quote ? { price: quote.price, lineVisible: true, axisLabelVisible: true, title: quote.source === 'historical-close' ? 'Last close' : 'LTP', color: quote.change == null || quote.change === 0 ? colorTextSecondary : quote.change < 0 ? colorError : colorSuccess } : { lineVisible: false, axisLabelVisible: false });
    const focused = visible.find(e => e.id === focusEventId);
    if (replayStep !== undefined && bars.length) {
      view.chart.timeScale().setVisibleLogicalRange({ from: Math.max(-2, bars.length - 65), to: bars.length + 3 });
    } else if (focused && view.focused !== `${timeframe}:${focusEventId}`) {
      const index = bars.findIndex(b => b.time === focused.time); view.chart.timeScale().setVisibleLogicalRange({ from: Math.max(-2, index - 40), to: index + 12 }); view.focused = `${timeframe}:${focusEventId}`; view.fitted = true;
    } else if (bars.length && (!view.fitted || (!focusEventId && view.focused))) {
      const first = visibleRange ? bars.findIndex(b => b.time >= bucketTime(Date.parse(visibleRange.from), timeframe)) : -1;
      const last = visibleRange ? bars.findLastIndex(b => b.time <= bucketTime(Date.parse(visibleRange.to) - 1, timeframe)) : bars.length - 1;
      view.chart.timeScale().setVisibleLogicalRange({ from: first >= 0 ? first - 2 : fitAll ? -1 : Math.max(0, bars.length - 100), to: (last >= 0 ? last : bars.length - 1) + (fitAll ? 1 : 4) });
      view.fitted = true; view.focused = undefined;
    }
  }, [bars, indicators, kind, events, levels, quote, focusEventId, timeframe, colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError, visibleRange, replayStep, showVolume, fitAll, volumeStyle]);
  const activeHover = hover?.replayStep === replayStep ? hover : null;
  const display = activeHover ?? bars.at(-1);
  return <div className="stock-candle-chart" role="figure" aria-label={`${symbol} price${showVolume ? ' and volume' : ''} chart`} data-volume-visible={showVolume} data-cross-count={indicators.reduce((sum,i)=>sum+(i.markers?.length??0),0)} onMouseLeave={() => { setHover(null); onHoverTime?.(undefined); }}>
    <div className="stock-chart-ohlc">{display && <><span>{activeHover ? activeHover.time : formatTime(chartTime(display.time))}</span><span>O <b>{stockNumber(display.open)}</b></span><span>H <b>{stockNumber(display.high)}</b></span><span>L <b>{stockNumber(display.low)}</b></span><span>C <b>{stockNumber(display.close)}</b></span><span>V <b>{display.volume.toLocaleString('en-IN')}</b></span></>}</div>
    <div ref={container} className="stock-chart-canvas" style={{ height }} />
    <div className="stock-chart-footer"><span>Scroll to zoom · drag to pan · hover to inspect · IST</span><span><button type="button" onClick={() => refs.current?.chart.timeScale().scrollToRealTime()}>Latest candle</button> <button type="button" onClick={() => refs.current?.chart.timeScale().fitContent()}>Fit chart</button></span></div>
    <span className="stock-chart-credit">Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> · Copyright © 2026 TradingView, Inc.</span>
  </div>;
}
