import { useEffect, useRef, useState } from 'react';
import { theme } from 'antd';
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, TickMarkType, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import type { ChartBar, StockQuote, StockTimeframe } from '../../modules/stock-details/types';
import { stockNumber } from '../../modules/stock-details/utils/format';

function chartTime(time: string): Time { return time.length === 10 ? time : Math.floor(Date.parse(time) / 1000) as UTCTimestamp; }
function formatTime(time: Time) {
  if (typeof time === 'number') return new Date(time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  if (typeof time === 'string') return new Date(`${time}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${time.day}/${time.month}/${time.year}`;
}
function ema(bars: ChartBar[], period: number) {
  let value = bars[0]?.close ?? 0;
  return bars.flatMap((bar, index) => {
    if (index) value = bar.close * 2 / (period + 1) + value * (1 - 2 / (period + 1));
    return index >= period - 1 ? [{ time: chartTime(bar.time), value }] : [];
  });
}
interface ChartRefs { chart: IChartApi; candles: ISeriesApi<'Candlestick'>; line: ISeriesApi<'Line'>; volume: ISeriesApi<'Histogram'>; fast: ISeriesApi<'Line'>; slow: ISeriesApi<'Line'>; prices: IPriceLine[]; fitted: boolean; bars: Map<Time, ChartBar> }
export function StockCandlestickChart({ bars, quote, timeframe, showEma, kind, symbol }: {
  bars: ChartBar[]; quote?: StockQuote; timeframe: StockTimeframe; showEma: boolean; kind: 'candles' | 'line'; symbol: string;
}) {
  const container = useRef<HTMLDivElement>(null), refs = useRef<ChartRefs | null>(null);
  const [hover, setHover] = useState<ChartBar | null>(null);
  const { token } = theme.useToken();
  const { colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError } = token;
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true, height: 390, layout: { background: { type: ColorType.Solid, color: colorBgContainer }, textColor: colorTextSecondary, fontFamily: 'Inter Variable, sans-serif', fontSize: 10, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: colorBorderSecondary, style: LineStyle.Dotted } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: timeframe.endsWith('m') && timeframe !== '1mo', secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) => typeof time === 'number' && (type === TickMarkType.Time || type === TickMarkType.TimeWithSeconds) ? new Date(time * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) : null },
      localization: { locale: 'en-IN', timeFormatter: formatTime },
      crosshair: { vertLine: { color: colorTextSecondary, style: LineStyle.Dashed }, horzLine: { color: colorTextSecondary, style: LineStyle.Dashed } },
    });
    const priceFormat = { type: 'custom' as const, minMove: 0.01, formatter: (value: number) => stockNumber(value) };
    const candles = chart.addSeries(CandlestickSeries, { priceFormat, upColor: colorSuccess, downColor: colorError, wickUpColor: colorSuccess, wickDownColor: colorError, borderVisible: false, priceLineVisible: false, lastValueVisible: false });
    const line = chart.addSeries(LineSeries, { priceFormat, color: '#5477e7', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
    chart.panes()[0].setStretchFactor(4); chart.panes()[1].setStretchFactor(1);
    const fast = chart.addSeries(LineSeries, { priceFormat, color: '#8973e8', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const slow = chart.addSeries(LineSeries, { priceFormat, color: '#d2a64c', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const prices = [candles, line].map(series => series.createPriceLine({ price: 0, color: colorTextSecondary, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: 'LTP', lineVisible: false }));
    refs.current = { chart, candles, line, volume, fast, slow, prices, fitted: false, bars: new Map() };
    chart.subscribeCrosshairMove(event => {
      const value = event.time && refs.current?.bars.get(typeof event.time === 'object' ? `${event.time.year}-${String(event.time.month).padStart(2, '0')}-${String(event.time.day).padStart(2, '0')}` : event.time);
      if (value) setHover({ ...value, time: formatTime(event.time!) });
      else setHover(null);
    });
    return () => { refs.current = null; chart.remove(); };
  }, [timeframe, colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError]);
  useEffect(() => {
    const view = refs.current; if (!view) return;
    view.bars = new Map(bars.map(bar => [chartTime(bar.time), bar]));
    view.candles.setData(bars.map(bar => ({ ...bar, time: chartTime(bar.time) })));
    view.line.setData(bars.map(bar => ({ time: chartTime(bar.time), value: bar.close })));
    view.volume.setData(bars.map(bar => ({ time: chartTime(bar.time), value: bar.volume, color: bar.close >= bar.open ? `${colorSuccess}70` : `${colorError}70` })));
    view.fast.setData(ema(bars, 5)); view.slow.setData(ema(bars, 21));
    if (bars.length && !view.fitted) { view.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 120), to: bars.length + 3 }); view.fitted = true; }
  }, [bars, timeframe, colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError]);
  useEffect(() => {
    const view = refs.current; if (!view) return;
    view.candles.applyOptions({ visible: kind === 'candles' }); view.line.applyOptions({ visible: kind === 'line' });
    view.fast.applyOptions({ visible: showEma }); view.slow.applyOptions({ visible: showEma });
  }, [kind, showEma, timeframe, colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError]);
  useEffect(() => {
    const view = refs.current; if (!view) return;
    for (const price of view.prices) {
      if (quote) price.applyOptions({ price: quote.price, lineVisible: true, axisLabelVisible: true, title: quote.source === 'historical-close' ? 'Last close' : 'LTP', color: quote.change == null || quote.change === 0 ? colorTextSecondary : quote.change < 0 ? colorError : colorSuccess });
      else price.applyOptions({ lineVisible: false, axisLabelVisible: false });
    }
  }, [quote, timeframe, colorBgContainer, colorTextSecondary, colorBorderSecondary, colorSuccess, colorError]);
  const last = bars.at(-1), display = hover ?? last;
  return <div className="stock-candle-chart" role="figure" aria-label={`${symbol} price and volume chart`}>
    <div className="stock-chart-ohlc">{display && <><span>{hover ? hover.time : formatTime(chartTime(display.time))}</span><span>O <b>{stockNumber(display.open)}</b></span><span>H <b>{stockNumber(display.high)}</b></span><span>L <b>{stockNumber(display.low)}</b></span><span>C <b>{stockNumber(display.close)}</b></span></>}</div>
    <div ref={container} className="stock-chart-canvas" />
    <div className="stock-chart-footer"><span>Scroll to zoom · drag to pan · hover to inspect · IST</span><button type="button" onClick={() => refs.current?.chart.timeScale().fitContent()}>Fit chart</button></div>
    <span className="stock-chart-credit">Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> · Copyright © 2026 TradingView, Inc.</span>
  </div>;
}
