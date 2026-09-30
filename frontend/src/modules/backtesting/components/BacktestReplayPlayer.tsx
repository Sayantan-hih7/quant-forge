import type { VolumeStyle } from '../../stock-details/utils/volumeSettings';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Select, Slider, Space, Spin, Tag } from 'antd';
import { CaretRightOutlined, PauseOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons';
import { apiClient } from '../../../services/apiClient';
import { StockCandlestickChart } from '../../../components/charts/StockCandlestickChart';
import { ChartIndicators } from '../../stock-details/components/ChartIndicators';
import { plotIndicator, strategyIndicators, type ChartIndicator } from '../../stock-details/utils/chartIndicators';
import { barEnd } from '../../stock-details/utils/chartTime';
import type { BackendBacktest } from '../types/backend';
import type { BacktestReplayView } from '../types/replay';
import type { BacktestPosition } from '../utils/stockResults';
import { replayFrame, replayTimeline } from '../utils/replayTimeline';
import { reportMoney, reportTime } from '../utils/reportFormat';
import { ReplayExplanation } from './ReplayExplanation';
import '../../../styles/backtest-replay.css';

export function BacktestReplayPlayer({ run, instrumentId, symbol, position }: { run: BackendBacktest; instrumentId: string; symbol: string; position: BacktestPosition }) {
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<{ data?: BacktestReplayView; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<BacktestReplayView>(`/backtests/${encodeURIComponent(run._id)}/stocks/${encodeURIComponent(instrumentId)}/replay`, { signal: controller.signal, timeout: 600000 })
      .then(({ data }) => { if (!controller.signal.aborted) setState({ data }); })
      .catch((error: Error) => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [run._id, instrumentId, request]);
  if (state.error) return <Alert type="error" showIcon title="Replay could not be prepared" description={state.error}
    action={<Button onClick={() => { setState({}); setRequest(n => n + 1); }}>Retry replay</Button>}/>;
  if (!state.data) return <div className="bt-replay-loading" role="status"><Spin/><strong>Preparing candle replay…</strong><span>For older reports, we verify the saved trades before reconstructing their explanations. This can take a few minutes the first time.</span></div>;
  return <ReplayPlayback key={position.id} view={state.data} run={run} entryAt={position.entryAt!} symbol={symbol}/>;
}

function ReplayPlayback({ view, run, entryAt, symbol }: { view: BacktestReplayView; run: BackendBacktest; entryAt: string; symbol: string }) {
  const timeline = useMemo(() => replayTimeline(view, entryAt), [view, entryAt]);
  const { steps } = timeline;
  const signalIndex = steps.findIndex(s => s.event?.kind === 'signal' && s.event.side === 'BUY');
  const entryIndex = steps.findIndex(s => s.event?.kind === 'entry');
  const [index, setIndex] = useState(Math.max(0, signalIndex));
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const [showVolume,setShowVolume]=useState(true),[volumeStyle,setVolumeStyle]=useState<VolumeStyle>();
  const [custom, setCustom] = useState<ChartIndicator[]>([]), [showStrategy, setShowStrategy] = useState(true);
  const seeded = useMemo(() => strategyIndicators(run.strategy), [run.strategy]);
  const frame = useMemo(() => replayFrame(timeline.bars, steps, index), [timeline, steps, index]);
  const last = index === steps.length - 1, running = playing && !last;
  const jump = (next: number) => { setPlaying(false); setIndex(Math.max(0, Math.min(steps.length - 1, next))); };
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex(index + 1), 1400 / speed);
    return () => window.clearTimeout(timer);
  }, [running, index, speed]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  const lines = useMemo(() => {
    if (!frame) return [];
    return [...(showStrategy ? seeded.indicators : []), ...custom].filter(i=>showVolume||i.kind!=='volumeSma').flatMap(indicator => {
      const sourceFrame = indicator.timeframe === 'chart' ? view.timeframe : indicator.timeframe;
      // Filter EVERY source, including custom indicators, before calculation.
      const source = (view.frames[sourceFrame] ?? []).filter(b => barEnd(b.time, sourceFrame) <= frame.step.at);
      return plotIndicator(indicator, source, frame.bars, view.timeframe, frame.step.at);
    });
  }, [frame, view, seeded, showStrategy, custom, showVolume]);
  if (!frame || timeline.missingEvents > 0) return <Alert type="warning" showIcon title="Some candles needed for this replay are unavailable"
    description="Use the normal chart and recorded trade history. Replay will not guess the missing sequence."/>;
  const nextExit = steps.findIndex((s,i) => i > index && s.event?.kind === 'exit');
  const nextCandle = steps.findIndex((s,i) => i > index && s.bar > frame.step.bar);
  const event = frame.step.event;
  return <section className="bt-replay" aria-label="Trade replay">
    <div className="bt-replay-heading"><div><strong>Candle replay</strong><p>Follow the saved trade one candle at a time. Future candles stay hidden.</p></div><Space wrap>
      <Tag color="purple">Revision {view.revision}</Tag><Tag>{view.timeframe === '1d' ? 'Daily' : '1-minute'} candles</Tag>
      <Tag color={view.source === 'fills-only' ? 'orange' : 'green'}>{view.source === 'fills-only' ? 'Recorded fills only' : view.source === 'recorded' ? 'Recorded decisions' : 'Verified against report'}</Tag>
    </Space></div>
    {view.warnings.length > 0 && <Alert showIcon type="warning" title="Replay notes" description={view.warnings.map((w,i) => <div key={i}>{w}</div>)}/>}
    <div className="bt-replay-controls">
      <Space wrap><Button aria-label="Previous replay step" icon={<StepBackwardOutlined/>} disabled={index === 0} onClick={() => jump(index - 1)}/>
        <Button type="primary" aria-label={running ? 'Pause' : last ? 'Replay again' : 'Play'} icon={running ? <PauseOutlined/> : <CaretRightOutlined/>} onClick={() => { if (last) setIndex(Math.max(0, signalIndex)); setPlaying(!running); }}>{running ? 'Pause' : last ? 'Replay again' : 'Play'}</Button>
        <Button aria-label="Next replay step" icon={<StepForwardOutlined/>} disabled={last} onClick={() => jump(index + 1)}/>
        <Select aria-label="Replay speed" value={speed} onChange={setSpeed} options={[1,2,5].map(v => ({value:v,label:`${v}× speed`}))}/>
        <Button disabled={nextCandle < 0} onClick={() => jump(nextCandle)}>Next candle</Button>
      </Space><Space wrap><Button disabled={signalIndex < 0} onClick={() => jump(signalIndex)}>Signal</Button><Button disabled={entryIndex < 0} onClick={() => jump(entryIndex)}>Entry</Button><Button disabled={nextExit < 0} onClick={() => jump(nextExit)}>Next exit</Button></Space>
      <Slider aria-label="Replay timeline" min={0} max={Math.max(1, steps.length - 1)} value={index} onChange={jump} tooltip={{ formatter: n => n == null ? '' : reportTime(new Date(steps[n]?.at ?? 0).toISOString()) }}/>
      <div className="bt-replay-clock"><strong>{reportTime(new Date(frame.step.at).toISOString())} IST</strong><span>{event ? event.kind === 'signal' ? `${event.side} signal` : event.kind === 'entry' ? 'Buy fill' : event.kind === 'exit' ? 'Exit fill' : 'Stop adjustment' : frame.step.phase === 'open' ? 'Open only · candle not complete' : 'Completed candle'} · Step {index + 1} / {steps.length}{last ? ' · Replay finished' : ''}</span></div>
    </div>
    <div className="bt-replay-metrics" aria-label="Position at this step">
      <div><span>Shares held</span><strong>{frame.quantity}</strong></div>
      <div><span>Entry price</span><strong>{frame.entry ? reportMoney(frame.entry.price!) : 'Not entered'}</strong></div>
      <div><span>Active stop</span><strong>{frame.quantity && frame.stop != null ? reportMoney(frame.stop) : '—'}</strong>{frame.quantity > 0 && frame.pendingStop != null && <small>Next candle: {reportMoney(frame.pendingStop)}</small>}</div>
      <div><span>Realized P&L so far</span><strong style={{color:frame.realized < 0 ? 'var(--negative)' : 'var(--positive)'}}>{reportMoney(frame.realized)}</strong><small>After fees on recorded exits</small></div>
    </div>
    <div className="bt-replay-stage"><div className="bt-replay-visual">
    <div className="bt-replay-chart-header"><span>Price & volume · {frame.step.phase === 'open' ? 'Only the open is shown for the newest candle' : 'Completed candles'}</span>
      <ChartIndicators showVolume={showVolume} volumeStyle={volumeStyle} onVolumeChange={change=>{if(change.showVolume!==undefined)setShowVolume(change.showVolume);if(change.volumeStyle)setVolumeStyle(change.volumeStyle);if(change.custom)setCustom(change.custom);}} custom={custom} onChange={setCustom} strategy={seeded.indicators} showStrategy={showStrategy} onShowStrategy={setShowStrategy} timeframe={view.timeframe}/></div>
    <div className="chart-indicator-legend" aria-label="Replay indicators">{lines.map(line => <span key={line.id} style={{color:line.color}}>{line.label} <b>{line.values.at(-1)?.value.toFixed(2) ?? 'Not enough history'}</b></span>)}</div>
    <StockCandlestickChart showVolume={showVolume} volumeStyle={volumeStyle} bars={frame.bars} timeframe={view.timeframe} kind="candles" symbol={symbol} indicators={lines} events={frame.markers} levels={frame.levels} replayStep={`${entryAt}:${index}`}
      onSelectEvent={id => { const n = steps.findIndex(s => s.event && `replay-${s.event.sequence}` === id); if (n >= 0 && n <= index) jump(n); }}/>
    </div>
    <ReplayExplanation step={frame.step} strategy={run.strategy} hasPosition={frame.quantity > 0} limited={view.source === 'fills-only'}/>
    </div>
    {last && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={frame.quantity > 0 ? 'End of saved test period. This position is still open.' : 'This trade is complete. Choose another trade or replay it again.'}/>}
    <p className="muted bt-replay-footnote">Historical simulation, using the saved strategy revision. Daily candles do not reveal the intraday price path; playback does not invent intermediate ticks. Entry, stop and target lines appear only after the recorded entry.</p>
  </section>;
}
