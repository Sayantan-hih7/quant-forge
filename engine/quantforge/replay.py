"""Causal indicator cache shared by historical replay and live decisions."""
import math
import pandas as pd
from .market import timeframe, stamp
from .rules import Observations, FACTS, evaluate_observations, validate_rule, wilder
from .indicator_settings import settings_key
from .field_catalog import REPORT_FIELDS, parameters


class ReplayObservations(Observations):
    def __init__(self, instrument, cutoff):
        super().__init__(instrument, cutoff)
        self.end = self.cutoff
        self.frames = {}
        self.series = {}
        self.frame_ends = {}

    def bars(self, frame):
        if frame not in self.frames:
            self.frames[frame] = timeframe(self.daily, self.intraday, frame, self.end)
        return self.frames[frame]

    def completed_count(self, frame):
        if frame not in self.frame_ends:
            self.frame_ends[frame] = pd.DatetimeIndex(self.bars(frame).end)
        return self.frame_ends[frame].searchsorted(self.cutoff, side='right')

    def completed_bars(self, frame):
        return self.bars(frame).iloc[:self.completed_count(frame)]

    def values(self, field, frame, period=None, offset=0, settings=None):
        period, offset = parameters(field, period, offset)
        if field in FACTS:
            self.cache.pop((field, frame, period, offset, settings_key(settings)), None)
            return super().values(field, frame, period, offset, settings)
        key = field, frame, period, offset, settings_key(settings)
        bars = self.bars(frame)
        if field in REPORT_FIELDS:
            values = self.calculate(field, frame, period, settings).shift(offset)
            return values.iloc[:self.completed_count(frame)]
        if key not in self.series:
            self.series[key] = self.calculate(field, frame, period, settings).shift(offset)
        return self.series[key].iloc[:self.completed_count(frame)] if not bars.empty else self.series[key]

    def atr(self, frame, period):
        bars = self.bars(frame)
        key = "atr", frame, period
        if bars.empty:
            return None
        if key not in self.series:
            tr = pd.concat([bars.high-bars.low, (bars.high-bars.close.shift()).abs(), (bars.low-bars.close.shift()).abs()], axis=1).max(axis=1)
            self.series[key] = wilder(tr, period)
        values = self.series[key].iloc[:self.completed_count(frame)]
        value = float(values.iloc[-1]) if len(values) else math.nan
        return value if math.isfinite(value) and value > 0 else None

    def signal_low(self, frame):
        """Freeze a completed candle's low at decision time, never the fill day's low."""
        completed = self.completed_bars(frame)
        return float(completed.low.iloc[-1]) if len(completed) else None


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
            "referencePrice": float(bars.close.iloc[-1]) if len(bars) else None,
            "atr": data.atr(strategy["risk"]["timeframe"], strategy["risk"]["atrPeriod"]),
            "signalLow": data.signal_low(strategy['risk']['timeframe']) if strategy['risk']['stopMode'] == 'candleLow' else None}
