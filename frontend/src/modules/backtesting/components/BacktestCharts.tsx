import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { useId } from "react";
import type { EquityPoint } from "../types";
import { money } from "../config/backtestDefaults";

export function BacktestCharts({
  data,
  capital,
}: {
  data: EquityPoint[];
  capital: number;
}) {
  const id = useId().replaceAll(":", "");
  const date = (value: number) =>
    new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      timeZone: "Asia/Kolkata",
    });
  return (
    <div className="bt-chart-stack">
      {(["equity", "drawdown"] as const).map((key) => (
        <section key={key} className="bt-chart-card">
          <header>
            <h3>{key === "equity" ? "Equity curve" : "Drawdown"}</h3>
            <span>
              {key === "equity" ? "After estimated costs" : "From running peak"}{" "}
              · simulated
            </span>
          </header>
          <div
            className={`bt-chart bt-chart-${key}`}
            role="figure"
            aria-label={`${key === "equity" ? "Equity curve" : "Drawdown"} from simulated trades`}
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{
                width: 600,
                height: key === "equity" ? 230 : 140,
              }}
            >
              <AreaChart
                data={data}
                accessibilityLayer
                margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`${id}-${key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={`var(--${key === "equity" ? "primary" : "negative"})`}
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor={`var(--${key === "equity" ? "primary" : "negative"})`}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={date}
                  minTickGap={55}
                  tick={{ fontSize: 9, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={65}
                  domain={key === "equity" ? ["auto", "auto"] : ["auto", 0]}
                  tickFormatter={(value: number) =>
                    key === "equity"
                      ? `₹${(value / 1000).toFixed(0)}k`
                      : `${value.toFixed(1)}%`
                  }
                  tick={{ fontSize: 9, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine
                  y={key === "equity" ? capital : 0}
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                />
                <Area
                  type="linear"
                  dataKey={key}
                  stroke={`var(--${key === "equity" ? "primary" : "negative"})`}
                  fill={`url(#${id}-${key})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Tooltip
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as
                      | EquityPoint
                      | undefined;
                    return active && point ? (
                      <div className="bt-chart-tooltip">
                        <span>{date(point.time)}</span>
                        <strong>
                          {key === "equity"
                            ? money(point.equity)
                            : `${point.drawdown.toFixed(2)}%`}
                        </strong>
                      </div>
                    ) : null;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      ))}
    </div>
  );
}
