from datetime import timedelta, timezone
import numpy as np
import pandas as pd

IST = timezone(timedelta(hours=5, minutes=30))
FRAME_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240}


def stamp(value):
    result = pd.Timestamp(value)
    return result.tz_localize("UTC") if result.tzinfo is None else result.tz_convert("UTC")


def candles(rows, cutoff, interval="1d"):
    """Validate before aggregation; duplicates with conflicting values fail closed."""
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume", "end"])
    raw = pd.DataFrame(rows)
    df = raw[["open", "high", "low", "close", "volume"]].astype(float)
    if not np.isfinite(df.to_numpy()).all():
        raise ValueError("Non-finite candle value")
    if ((df[["open", "high", "low", "close"]] <= 0).any(axis=1) | (df.volume < 0)
        | (df.high < df[["open", "close", "low"]].max(axis=1))
        | (df.low > df[["open", "close"]].min(axis=1))).any():
        raise ValueError("Invalid OHLCV candle")
    times = pd.DatetimeIndex(pd.to_datetime(raw.time, utc=True, format="mixed"))
    if times.isna().any():
        raise ValueError("Invalid candle timestamp")
    local = times.tz_convert(IST)
    if interval == "1d":
        start = local.normalize() + pd.Timedelta(hours=9, minutes=15)
        end = local.normalize() + pd.Timedelta(hours=15, minutes=30)
    else:
        minute = local.hour * 60 + local.minute
        if ((minute < 555) | (minute >= 930) | (local.second != 0)).any():
            raise ValueError("Intraday candle outside the regular IST session")
        start, end = times, times + pd.Timedelta(minutes=1)
    df.index = start.tz_convert("UTC").rename(None)
    df["end"] = end
    df = df.loc[end <= stamp(cutoff)]
    duplicated = df.loc[df.index.duplicated(keep=False)]
    if not duplicated.empty and (duplicated.groupby(level=0).nunique() > 1).any().any():
        raise ValueError("Conflicting duplicate candle")
    return df.loc[~df.index.duplicated()].sort_index()


def timeframe(daily, intraday, frame, cutoff):
    if frame == "1d":
        return daily
    if frame == "1m":
        return intraday
    source = daily if frame in ("1w", "1mo", "1q") else intraday
    if source.empty:
        return source
    local = source.index.tz_convert(IST)
    if frame in ("1mo", "1q", "1w"):
        frequency = {"1mo": "M", "1q": "Q", "1w": "W-SUN"}[frame]
        start = local.tz_localize(None).to_period(frequency).to_timestamp().tz_localize(IST)
        end = start + (pd.Timedelta(days=7) if frame == "1w" else pd.offsets.MonthBegin(3 if frame == "1q" else 1))
    elif frame in FRAME_MINUTES:
        session = local.normalize() + pd.Timedelta(hours=9, minutes=15)
        size = FRAME_MINUTES[frame]
        start = session + pd.to_timedelta(((local - session).total_seconds() // 60 // size) * size, unit="m")
        end = (start + pd.Timedelta(minutes=size)).where(start + pd.Timedelta(minutes=size) <= session + pd.Timedelta(minutes=375), session + pd.Timedelta(minutes=375))
    else:
        raise ValueError(f"Unsupported timeframe: {frame}")
    grouped = source.assign(time=start, end=end).loc[end <= stamp(cutoff)].groupby("time", sort=True)
    result = grouped.agg(open=("open", "first"), high=("high", "max"), low=("low", "min"),
                         close=("close", "last"), volume=("volume", "sum"), end=("end", "first"))
    if frame in FRAME_MINUTES and not result.empty:
        expected = (pd.DatetimeIndex(result.end) - result.index).total_seconds() // 60
        result = result.loc[grouped.size() == expected]  # Never invent missing minutes.
    return result
