import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import '../../styles/charts.css';

export interface TrendPoint {
  time: number;
  value: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  baseline?: number;
  tone: 'positive' | 'negative' | 'neutral';
  label: string;
  expanded?: boolean;
  formatValue: (value: number) => string;
  formatTime: (time: number) => string;
}

/** Shared Recharts presentation for small trends and detailed time-series previews. */
export function TrendChart({ data, baseline, tone, label, expanded = false, formatValue, formatTime }: TrendChartProps) {
  const gradientId = `trend-${useId().replaceAll(':', '')}`;
  const color = `var(--${tone === 'neutral' ? 'muted' : tone})`;
  const values = [...(baseline === undefined ? [] : [baseline]), ...data.map((point) => point.value)];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.12, Math.abs(baseline ?? low) * 0.0001, 0.01);
  const ticks = data.length ? [data[0].time, data[Math.floor(data.length / 2)].time, data[data.length - 1].time] : [];

  return (
    <div className="trend-chart" role={expanded ? 'figure' : 'img'} aria-label={label}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: expanded ? 480 : 110, height: expanded ? 240 : 40 }}>
        <AreaChart data={data} accessibilityLayer={expanded} margin={{ top: 8, right: 3, bottom: 3, left: 3 }} aria-label={expanded ? `${label} Use left and right arrow keys to inspect points.` : undefined}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {expanded && <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />}
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide={!expanded} ticks={ticks} tickFormatter={formatTime} tick={{ fill: 'var(--muted)', fontSize: 9 }} axisLine={false} tickLine={false} height={24} minTickGap={18} interval="preserveStartEnd" />
          <YAxis domain={[low - padding, high + padding]} hide={!expanded} orientation="right" width={72} tickFormatter={formatValue} tick={{ fill: 'var(--muted)', fontSize: 9 }} axisLine={false} tickLine={false} tickCount={4} />
          {baseline !== undefined && <ReferenceLine y={baseline} stroke="var(--muted)" strokeOpacity={0.6} strokeDasharray="4 4" />}
          <Area type="linear" dataKey="value" stroke={color} strokeWidth={expanded ? 2 : 1.6} fill={expanded ? `url(#${gradientId})` : 'none'} dot={false} activeDot={expanded ? { r: 4, stroke: 'var(--surface)', strokeWidth: 2 } : false} isAnimationActive={false} />
          {expanded && <Tooltip isAnimationActive={false} cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} content={({ active, payload, label: time }) => {
            const value = payload?.[0]?.value;
            if (!active || typeof value !== 'number') return null;
            return <div className="trend-chart-tooltip"><span>{formatTime(Number(time))} IST</span><strong style={{ color }}>{formatValue(value)} <small>pts</small></strong></div>;
          }} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
