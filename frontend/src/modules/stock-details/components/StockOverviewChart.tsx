import { ChartGapDetails } from './ChartGapDetails';
import { useMemo } from 'react';
import { Button, Empty, Popover, Segmented, Skeleton, Space, Tag, Tooltip } from 'antd';
import { ExpandOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { StockCandlestickChart } from '../../../components/charts/StockCandlestickChart';
import { useStockResource } from '../hooks/useStockResource';
import { useChartPreferences } from '../store/chartPreferences';
import { liveChart } from '../utils/liveChart';
import { overviewDate, overviewOptions, overviewRequest, overviewWindow, type OverviewPeriod } from '../utils/overviewRange';
import { ChartAppearanceControls } from './ChartAppearanceControls';
import type { StockChartPanelProps } from './StockChartPanel';
import type { LiveChartBar, StockChartData } from '../types';

const noBars: LiveChartBar[] = [];
export function StockOverviewChart({ instrumentId, symbol, quote, liveBars = noBars, now, strategy, period, onPeriodChange: setPeriod, onAdvanced }: StockChartPanelProps & {
  period: OverviewPeriod; onPeriodChange: (period: OverviewPeriod) => void; onAdvanced: () => void;
}) {
  const mode = strategy ? 'strategy' : 'research';
  const showVolume = useChartPreferences(s => s[mode].showVolume ?? true), update = useChartPreferences(s => s.update);
  const volumeStyle = useChartPreferences(s => s[mode].volumeStyle);
  const kind = useChartPreferences(s => s.overviewKind), setKind = useChartPreferences(s => s.setOverviewKind);
  const request = overviewRequest(period, kind);
  const params = new URLSearchParams({ timeframe: request.timeframe });
  if (request.lookbackDays) params.set('lookbackDays', String(request.lookbackDays));
  const chart = useStockResource<StockChartData>(`/stocks/${encodeURIComponent(instrumentId)}/chart?${params}`, 60_000, undefined, 'repair=true');
  const view = useMemo(() => chart.data ? liveChart(chart.data, liveBars, quote, now) : { bars: [], partial: false, forming: false }, [chart.data, liveBars, quote, now]);
  const window = useMemo(() => overviewWindow(view.bars, period, now, quote), [view.bars, period, now, quote]);
  const shownPeriod = period === 'today' ? `${window.latestSession ? 'Latest available session' : 'Today'} · ${overviewDate(window.session)}` : `${overviewDate(window.from)} – ${overviewDate(window.to)}`;
  const historyMessage = chart.data?.incompleteBucketTimes ? chart.data.historyMessage : chart.data?.message;
  const missingTimes = (chart.data?.incompleteBucketTimes ?? []).filter(time => {
    const day = time.slice(0, 10);
    return period === 'today' ? day === window.session : (!window.from || day >= window.from) && (!window.to || day <= window.to);
  });
  const missing = missingTimes.length;
  return <section className="stock-chart-section stock-overview-chart" aria-label="Stock overview chart">
    <div className="stock-chart-controls overview-compact-controls">
      <Segmented aria-label="Period shown" value={period} options={overviewOptions} onChange={setPeriod}/>
      <Space size={8} wrap><ChartAppearanceControls kind={kind} showVolume={showVolume} onKindChange={setKind} onVolumeChange={value => update(mode, { showVolume: value })}/>
        <Tooltip title="Refresh price history"><Button aria-label="Refresh overview chart" size="small" icon={<ReloadOutlined/>} loading={chart.loading} onClick={chart.retry}/></Tooltip>
        <Tooltip title="Open advanced chart"><Button aria-label="Open advanced chart" size="small" icon={<ExpandOutlined/>} onClick={onAdvanced}/></Tooltip>
      </Space>
    </div>
    <div className="stock-overview-caption" aria-label="Overview period"><strong>{shownPeriod}</strong><span>{request.intervalLabel}</span>
      {view.forming&&<Tooltip title={view.partial?'Current interval preview. Some earlier minutes in this forming candle have not arrived yet. It is not a completed trading signal.':'Current interval is still updating. Strategy signals use completed candles.'}><Tag color="blue">{kind==='line'?'Live minute':'Forming candle'}{view.partial?' - partial':''}</Tag></Tooltip>}
      {(chart.error||historyMessage||missing>0)&&<Popover trigger="click" title="Chart data status" content={<div style={{maxWidth:320}}>
        <p>{chart.error||historyMessage}</p>{missing>0&&<ChartGapDetails data={chart.data} times={missingTimes}/>}
        <Button size="small" loading={chart.loading} onClick={chart.retry}>{chart.loading ? 'Checking missing history...' : 'Retry history'}</Button>
      </div>}><Button size="small" className="chart-data-status" aria-label={chart.error||historyMessage?'History needs attention':`${missing} history gap${missing===1?'':'s'}`} icon={<WarningOutlined/>}>{chart.error||historyMessage?'History needs attention':`${missing} history gap${missing===1?'':'s'}`}</Button></Popover>}
    </div>
    {chart.loading && !chart.data ? <div className="stock-chart-loading"><Skeleton active paragraph={{ rows: 5 }}/><p>Loading the selected period…</p></div> : window.bars.length ?
      <StockCandlestickChart key={`${instrumentId}:${period}:${period === 'today' ? window.session : ''}`} bars={window.bars} quote={quote} timeframe={request.timeframe} kind={kind} symbol={symbol} volumeStyle={volumeStyle} showVolume={showVolume} fitAll/> :
      <div className="stock-chart-empty"><Empty description={period === 'today' ? 'No candles available for this session yet' : 'No candles available for this period'}/><Space><Button onClick={chart.retry}>Retry</Button><Button onClick={() => setPeriod('1mo')}>View 1 month</Button></Space></div>}
    <p className="stock-chart-note">{period === 'today' ? 'Today shows movement within one session. On non-trading days, the latest available session is dated above.' : period === 'all' ? 'All available candles in the chart’s history window, up to 6 years. New listings have shorter history.' : 'The chart shows available candles within your chosen period.'} Use Advanced chart for indicators and your own candle interval.</p>
  </section>;
}
