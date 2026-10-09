"""Rank simultaneous candidates from completed signal candles only."""
import math


def signal_score(observations, risk, frame):
    mode = risk.get('signalRanking', 'instrumentId')
    if mode == 'instrumentId':
        return 0.0
    if mode not in ('turnover', 'relativeVolume'):
        raise ValueError('Unsupported signal ranking')
    bars = observations.completed_bars(frame)
    if bars.empty:
        return None
    last = bars.iloc[-1]
    if mode == 'turnover':
        value = float(last.close * last.volume)
    else:
        if len(bars) < 21:
            return None
        average = float(bars.volume.iloc[-21:-1].mean())
        if average <= 0:
            return None
        value = float(last.volume) / average
    return value if math.isfinite(value) else None
