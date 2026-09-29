import { useState } from 'react';
import { Button, Checkbox, InputNumber, Popover, Select, Space, Tag } from 'antd';
import { SlidersOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { fixedPeriodIndicators, indicatorKinds, indicatorName, indicatorColors, indicatorLabel, type ChartIndicator, type IndicatorKind } from '../utils/chartIndicators';
import type { StockTimeframe } from '../types';

export function ChartIndicators({ custom, onChange, strategy, showStrategy, onShowStrategy, timeframe }: {
  custom: ChartIndicator[]; onChange: (indicators: ChartIndicator[]) => void; strategy: ChartIndicator[];
  showStrategy: boolean; onShowStrategy: (value: boolean) => void; timeframe: StockTimeframe;
}) {
  const [kind, setKind] = useState<IndicatorKind>('ema'), [period, setPeriod] = useState<number | null>(21);
  const content = <div className="chart-indicator-picker">
    <p className="muted">Chart settings only. Your saved strategy stays unchanged.</p>
    {!!strategy.length && <><Checkbox checked={showStrategy} onChange={e => onShowStrategy(e.target.checked)}>Show strategy indicators</Checkbox><div className="chart-strategy-indicators">{strategy.map(i => <Tag key={i.id}>{indicatorLabel(i, timeframe)}</Tag>)}</div><p className="muted">Strategy indicators use their own timeframes and completed candles.</p></>}
    <strong>Your chart indicators</strong>
    {custom.map(i => <div className="chart-indicator-row" key={i.id}><span style={{ color: i.color }}>{indicatorLabel(i, timeframe)}</span><Button type="text" size="small" aria-label={`Remove ${i.kind.toUpperCase()} ${i.period}`} icon={<DeleteOutlined />} onClick={() => onChange(custom.filter(x => x.id !== i.id))} /></div>)}
    {!custom.length && <p className="muted">Add an indicator to explore the chart.</p>}
    <Space.Compact className="chart-add-indicator">
      <Select aria-label="Indicator type" value={kind} onChange={v => { setKind(v); setPeriod(v === 'ema' ? 21 : v === 'sma' ? 50 : ['rvol','bollinger','bollingerBandwidth'].includes(v) ? 20 : 14); }} options={indicatorKinds.map(value => ({ value, label: indicatorName(value) }))} />
      {!fixedPeriodIndicators.includes(kind) && <InputNumber aria-label="Indicator period" min={2} max={400} precision={0} value={period} onChange={setPeriod} />}
      <Button aria-label="Add indicator" icon={<PlusOutlined />} disabled={custom.length >= 6 || !period || period < 2 || period > 400} onClick={() => onChange([...custom, { id: crypto.randomUUID(), kind, period: period!, timeframe: 'chart', color: indicatorColors[custom.length % indicatorColors.length] }])}>Add</Button>
    </Space.Compact>
    <p className="muted">Up to 6 custom indicators. VWAP resets each trading day; MACD uses 12 / 26 / 9.</p>
  </div>;
  return <Popover trigger="click" placement="bottomRight" title="Indicators" content={content}><Button aria-label="Indicators" size="small" icon={<SlidersOutlined />}>Indicators</Button></Popover>;
}
