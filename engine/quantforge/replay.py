"""Causal indicator cache shared by historical replay and live decisions."""
import math
import pandas as pd
from .market import timeframe, stamp
from .rules import Observations, FACTS, indicator, evaluate_observations, validate_rule, wilder


class ReplayObservations(Observations):
    def __init__(self, instrument, cutoff):
        super().__init__(instrument, cutoff)
        self.end = self.cutoff
        self.frames = {}
        self.series = {}

    def bars(self, frame):
        if frame not in self.frames:
            self.frames[frame] = timeframe(self.daily, self.intraday, frame, self.end)
        return self.frames[frame]

    def values(self, field, frame):
        if field in FACTS:
            self.cache.pop((field, frame), None)
            return super().values(field, frame)
        key = field, frame
        bars = self.bars(frame)
        if key not in self.series:
            self.series[key] = indicator(bars, field)
        return self.series[key].loc[bars.end <= self.cutoff] if not bars.empty else self.series[key]

    def atr(self, frame, period):
        bars = self.bars(frame)
        key = "atr", frame, period
        if bars.empty:
            return None
        if key not in self.series:
            tr = pd.concat([bars.high-bars.low, (bars.high-bars.close.shift()).abs(), (bars.low-bars.close.shift()).abs()], axis=1).max(axis=1)
            self.series[key] = wilder(tr, period)
        values = self.series[key].loc[bars.end <= self.cutoff]
        value = float(values.iloc[-1]) if len(values) else math.nan
        return value if math.isfinite(value) and value > 0 else None


def decision(strategy, instrument, cutoff):
    validate_rule(strategy["entry"])
    validate_rule(strategy["exit"])
    data = ReplayObservations(instrument, cutoff)
    frame = "1d" if strategy["entry"]["cadence"] == "daily" else strategy["entry"]["cadence"]
    bars = data.bars(frame)
    # A stale lower-timeframe bar must not use higher-timeframe observations
    # published after that bar closed when the same data is inspected later.
    if len(bars):
        data.cutoff = stamp(bars.end.iloc[-1])
    return {"id": instrument["id"], "entry": evaluate_observations(strategy["entry"], instrument["id"], data),
            "exit": evaluate_observations(strategy["exit"], instrument["id"], data),
            "barEnd": bars.end.iloc[-1].isoformat() if len(bars) else None,
            "atr": data.atr(strategy["risk"]["timeframe"], strategy["risk"]["atrPeriod"])}
